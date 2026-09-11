import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { openApiMcpServer } from "@cloudflare/codemode/mcp";
import { githubRequest, getReadOnlySpec } from "./github-client";
import { loadLocalConfig } from "./local/config";
import { QuickJsExecutor } from "./local/quickjs-executor";
import { GbfOAuthService, installOAuthRoutes } from "./oauth";

const config = loadLocalConfig();
const executor = new QuickJsExecutor();
const spec = await getReadOnlySpec();
const oauth = config.GBF_PUBLIC_ORIGIN
  ? new GbfOAuthService({ publicOrigin: config.GBF_PUBLIC_ORIGIN, ownerSecret: config.MCP_BEARER_TOKEN })
  : null;

async function authorized(request: Request): Promise<boolean> {
  const bearer = request.header("authorization");
  if (bearer === `Bearer ${config.MCP_BEARER_TOKEN}`) return true;

  // API-key style compatibility for clients that support custom request headers.
  const apiKey = request.header("x-gbf-token");
  if (apiKey === config.MCP_BEARER_TOKEN) return true;

  if (!oauth || !bearer?.startsWith("Bearer ")) return false;
  return oauth.verifyAccessToken(bearer.slice("Bearer ".length));
}

function createGithubServer() {
  return openApiMcpServer({
    spec,
    executor,
    // Keep the MCP server identity distinct from ChatGPT's built-in GitHub
    // connector. Reusing the generic name "github" can make hosted clients
    // route/deduplicate the two integrations as if they were one provider.
    name: "gbf-readonly",
    description: `GBF Read Accelerator: strictly read-only GitHub REST access optimized to reduce model-visible tool round trips. This MCP server is an accelerator, not the normal GitHub connector and not a write path. The outer search and execute tools cannot mutate GitHub: host-side policy accepts only GET/HEAD on allowlisted repositories and repo-scoped search. Prefer one execute call that fans out fresh reads with Promise.all(), filters intermediate data inside the sandbox, and returns a compact result. Use search only when an endpoint is genuinely unknown. Common reads do not require discovery: GET /repos/{owner}/{repo}/contents/{path}?ref=... returns GBF-normalized UTF-8 text in content (not GitHub base64); GET /repos/{owner}/{repo}/issues/{number}; GET /repos/{owner}/{repo}/issues/{number}/comments with per_page=100; GET /repos/{owner}/{repo}/pulls/{number}; GET /search/code with q including repo:owner/repo. Do not manually base64-decode normalized contents responses. The sandbox has no filesystem, shell, process environment, or arbitrary network access. Use the normal GitHub connector for comments, branches, PR mutations, merges, or any write.`,
    request: async (opts) =>
      githubRequest(config, {
        method: opts.method,
        path: opts.path,
        query: opts.query as Record<string, unknown> | undefined
      })
  });
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));

if (oauth) installOAuthRoutes(app, oauth);

app.get("/health", (_request: Request, response: Response) => {
  response.set("Cache-Control", "no-store");
  response.json({
    ok: true,
    service: "github-but-fast",
    runtime: "local",
    mode: "read-only",
    sandbox: "quickjs",
    oauth: oauth ? "enabled" : "disabled"
  });
});

app.all("/mcp", async (request: Request, response: Response) => {
  if (!(await authorized(request))) {
    response.set("Cache-Control", "no-store");
    if (oauth) {
      response.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${oauth.origin}/.well-known/oauth-protected-resource", scope="gbf:read"`
      );
    }
    response.status(401).json({ error: "unauthorized" });
    return;
  }

  const server = createGithubServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  response.on("close", () => {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
});

const httpServer = app.listen(config.PORT, config.HOST, () => {
  console.log(`GitHub But Fast listening on http://${config.HOST}:${config.PORT}`);
  console.log(`Health: http://${config.HOST}:${config.PORT}/health`);
  console.log(`MCP:    http://${config.HOST}:${config.PORT}/mcp`);
  if (oauth) console.log(`OAuth issuer: ${oauth.origin}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down GBF.`);
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
