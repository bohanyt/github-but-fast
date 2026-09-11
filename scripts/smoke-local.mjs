import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const host = process.env.GBF_HOST?.trim() || "127.0.0.1";
const port = process.env.GBF_PORT?.trim() || "8787";
const token = process.env.MCP_BEARER_TOKEN?.trim();

if (!token) {
  throw new Error("Missing MCP_BEARER_TOKEN. Run with --env-file=.env.local.");
}

const endpoint = new URL(`http://${host}:${port}/mcp`);
const client = new Client({ name: "gbf-local-smoke", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
});

function textContent(result) {
  return (result.content ?? [])
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

try {
  await client.connect(transport);

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  console.log(`MCP tools: ${names.join(", ")}`);

  if (!names.includes("search") || !names.includes("execute")) {
    throw new Error(`Expected search + execute tools, got: ${names.join(", ")}`);
  }

  const result = await client.callTool({
    name: "execute",
    arguments: {
      code: `async () => {
        const [arti, recantor, rate] = await Promise.all([
          codemode.request({ method: "GET", path: "/repos/bohanyt/arti-dev" }),
          codemode.request({ method: "GET", path: "/repos/bohanyt/recantor" }),
          codemode.request({ method: "GET", path: "/rate_limit" })
        ]);

        return {
          arti: {
            full_name: arti.full_name,
            default_branch: arti.default_branch,
            private: arti.private
          },
          recantor: {
            full_name: recantor.full_name,
            default_branch: recantor.default_branch,
            private: recantor.private
          },
          rate: {
            core: rate.resources?.core,
            search: rate.resources?.search
          }
        };
      }`
    }
  });

  if (result.isError) {
    throw new Error(`execute returned MCP error: ${textContent(result) || JSON.stringify(result)}`);
  }

  const text = textContent(result);
  console.log("execute result:");
  console.log(text || JSON.stringify(result, null, 2));
  console.log("GBF local MCP smoke: PASS");
} finally {
  await client.close().catch(() => undefined);
}
