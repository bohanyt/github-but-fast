import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { openApiMcpServer } from "@cloudflare/codemode/mcp";
import { githubRequest, getReadOnlySpec } from "./github-client";
import { loadLocalConfig } from "./local/config";
import { QuickJsExecutor } from "./local/quickjs-executor";

const config = loadLocalConfig();
const executor = new QuickJsExecutor();
const spec = await getReadOnlySpec();

function authorized(request: Request): boolean {
  const bearer = request.header("authorization");
  if (bearer === `Bearer ${config.MCP_BEARER_TOKEN}`) return true;

  // Claude custom connectors support API-key style request headers when
  // configured with "No sign-in". Use a dedicated header so Claude's own
  // OAuth/Authorization handling cannot collide with GBF authentication.
  const apiKey = request.header("x-gbf-token");
  return apiKey === config.MCP_BEARER_TOKEN;
}

function createGithubServer() {
  return openApiMcpServer({
    spec,
    executor,
    name: "github",
    description: `GitHub But Fast (GBF): read-only GitHub REST access optimized to reduce model-visible tool round trips. Use search only when endpoint discovery is required. Prefer one execute call that fans out fresh GitHub reads with Promise.all(), filters intermediate data inside the sandbox, and returns a compact result. The sandbox has no filesystem, shell, process environment, or arbitrary network access. Host-side policy allows only GET/HEAD on allowlisted repositories and repo-scoped search.`,
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

app.get("/health", (_request: Request, response: Response) => {
  response.set("Cache-Control", "no-store");
  response.json({
    ok: true,
    service: "github-but-fast",
    runtime: "local",
    mode: "read-only",
    sandbox: "quickjs"
  });
});

app.all("/mcp", async (request: Request, response: Response) => {
  if (!authorized(request)) {
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
});

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down GBF.`);
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
