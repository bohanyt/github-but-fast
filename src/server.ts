import { createLegacyMcpHandler } from "agents/mcp";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { openApiMcpServer } from "@cloudflare/codemode/mcp";
import { getInstallationToken, githubHeaders } from "./github-auth";
import {
  assertReadOnlyGithubRequest,
  filterReadOnlyOpenApiSpec,
  parseAllowedRepos
} from "./policy";

const GITHUB_SPEC_URL =
  "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.2022-11-28.json";
const DEFAULT_RESPONSE_MAX_BYTES = 1_500_000;

let specCache: Record<string, unknown> | null = null;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

async function getReadOnlySpec(): Promise<Record<string, unknown>> {
  if (specCache) return specCache;
  const response = await fetch(GITHUB_SPEC_URL);
  if (!response.ok) throw new Error(`Failed to fetch GitHub OpenAPI spec: ${response.status}`);
  const fullSpec = (await response.json()) as Record<string, unknown>;
  specCache = filterReadOnlyOpenApiSpec(fullSpec);
  return specCache;
}

function maxResponseBytes(env: Env): number {
  if (!env.GITHUB_RESPONSE_MAX_BYTES) return DEFAULT_RESPONSE_MAX_BYTES;
  const parsed = Number(env.GITHUB_RESPONSE_MAX_BYTES);
  if (!Number.isFinite(parsed) || parsed < 16_384) {
    throw new Error("GITHUB_RESPONSE_MAX_BYTES must be a number >= 16384");
  }
  return Math.floor(parsed);
}

async function githubRequest(
  env: Env,
  opts: {
    method: string;
    path: string;
    query?: Record<string, unknown>;
  }
): Promise<unknown> {
  const allowedRepos = parseAllowedRepos(env.GITHUB_ALLOWED_REPOS);
  assertReadOnlyGithubRequest({ ...opts, allowedRepos });

  const url = new URL(`https://api.github.com${opts.path}`);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const token = await getInstallationToken(env);
  const response = await fetch(url, {
    method: opts.method.toUpperCase(),
    headers: githubHeaders(token)
  });

  if (opts.method.toUpperCase() === "HEAD") {
    response.body?.cancel();
    return {
      ok: response.ok,
      status: response.status,
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
      rate_limit_remaining: response.headers.get("x-ratelimit-remaining"),
      rate_limit_reset: response.headers.get("x-ratelimit-reset")
    };
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (response.status !== 204 && !contentType.toLowerCase().includes("json")) {
    response.body?.cancel();
    return {
      ok: false,
      error: "unsupported_content_type",
      status: response.status,
      content_type: contentType || null,
      hint: "GBF V1 accepts JSON GitHub API responses only; use a metadata/list endpoint instead of binary downloads."
    };
  }

  const text = await response.text();
  const byteLength = new TextEncoder().encode(text).byteLength;
  const limit = maxResponseBytes(env);
  if (byteLength > limit) {
    return {
      ok: false,
      error: "response_too_large",
      status: response.status,
      bytes: byteLength,
      limit,
      hint: "Narrow the request or paginate it before retrying."
    };
  }

  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body,
      rate_limit_remaining: response.headers.get("x-ratelimit-remaining"),
      rate_limit_reset: response.headers.get("x-ratelimit-reset")
    };
  }

  return body;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "github-but-fast",
        mode: "read-only",
        codemode: "experimental"
      });
    }

    if (url.pathname !== "/mcp") return json({ error: "not_found" }, 404);

    if (!env.MCP_BEARER_TOKEN) return json({ error: "server_not_configured" }, 503);
    if (bearerToken(request) !== env.MCP_BEARER_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }

    const spec = await getReadOnlySpec();
    const executor = new DynamicWorkerExecutor({ loader: env.LOADER });
    const server = openApiMcpServer({
      spec,
      executor,
      name: "github",
      description: `Read-only GitHub REST access for AI agents. The exposed OpenAPI document contains only GET/HEAD operations under /repos/*, repo-scoped /search/*, and /rate_limit. All host-side requests are revalidated before GitHub is called. Use search to discover endpoints when needed, then execute JavaScript to batch, parallelize, filter, and compact GitHub reads. This server cannot mutate GitHub.`,
      request: async (opts) =>
        githubRequest(env, {
          method: opts.method,
          path: opts.path,
          query: opts.query as Record<string, unknown> | undefined
        })
    });

    return createLegacyMcpHandler(server)(request, env, ctx);
  }
};
