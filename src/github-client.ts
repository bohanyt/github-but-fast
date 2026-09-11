import { getInstallationToken, githubHeaders, type GithubAuthConfig } from "./github-auth";
import {
  assertReadOnlyGithubRequest,
  filterReadOnlyOpenApiSpec,
  parseAllowedRepos
} from "./policy";

export const GITHUB_SPEC_URL =
  "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.2022-11-28.json";
export const DEFAULT_RESPONSE_MAX_BYTES = 1_500_000;

export interface GithubClientConfig extends GithubAuthConfig {
  GITHUB_ALLOWED_REPOS: string;
  GITHUB_RESPONSE_MAX_BYTES?: string;
}

export interface GithubRequestOptions {
  method: string;
  path: string;
  query?: Record<string, unknown>;
}

let specCache: Record<string, unknown> | null = null;

export async function getReadOnlySpec(): Promise<Record<string, unknown>> {
  if (specCache) return specCache;
  const response = await fetch(GITHUB_SPEC_URL);
  if (!response.ok) throw new Error(`Failed to fetch GitHub OpenAPI spec: ${response.status}`);
  const fullSpec = (await response.json()) as Record<string, unknown>;
  specCache = filterReadOnlyOpenApiSpec(fullSpec);
  return specCache;
}

function maxResponseBytes(config: GithubClientConfig): number {
  if (!config.GITHUB_RESPONSE_MAX_BYTES) return DEFAULT_RESPONSE_MAX_BYTES;
  const parsed = Number(config.GITHUB_RESPONSE_MAX_BYTES);
  if (!Number.isFinite(parsed) || parsed < 16_384) {
    throw new Error("GITHUB_RESPONSE_MAX_BYTES must be a number >= 16384");
  }
  return Math.floor(parsed);
}

export async function githubRequest(
  config: GithubClientConfig,
  opts: GithubRequestOptions
): Promise<unknown> {
  const allowedRepos = parseAllowedRepos(config.GITHUB_ALLOWED_REPOS);
  assertReadOnlyGithubRequest({ ...opts, allowedRepos });

  const url = new URL(`https://api.github.com${opts.path}`);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const token = await getInstallationToken(config);
  const response = await fetch(url, {
    method: opts.method.toUpperCase(),
    headers: githubHeaders(token)
  });

  const rateLimit = {
    limit: response.headers.get("x-ratelimit-limit"),
    remaining: response.headers.get("x-ratelimit-remaining"),
    used: response.headers.get("x-ratelimit-used"),
    reset: response.headers.get("x-ratelimit-reset"),
    resource: response.headers.get("x-ratelimit-resource")
  };

  if (opts.method.toUpperCase() === "HEAD") {
    response.body?.cancel();
    return {
      ok: response.ok,
      status: response.status,
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
      rate_limit: rateLimit
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
      rate_limit: rateLimit,
      hint: "GBF accepts JSON GitHub API responses only; use a metadata/list endpoint instead of binary downloads."
    };
  }

  const text = await response.text();
  const byteLength = new TextEncoder().encode(text).byteLength;
  const limit = maxResponseBytes(config);
  if (byteLength > limit) {
    return {
      ok: false,
      error: "response_too_large",
      status: response.status,
      bytes: byteLength,
      limit,
      rate_limit: rateLimit,
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
      rate_limit: rateLimit
    };
  }

  return body;
}
