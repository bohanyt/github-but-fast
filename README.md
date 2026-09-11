# GitHub But Fast

> GitHub, but with fewer model/tool round trips.

**GitHub But Fast (GBF)** is a read-only, token-efficient remote MCP gateway for GitHub. It uses Cloudflare Code Mode so an MCP-capable AI agent can discover GitHub REST endpoints and execute many fresh reads in one sandboxed JavaScript program, then return only the compact result it needs.

GBF is intended for ChatGPT, Claude Code, Cursor, Codex/Astra, and other clients that can connect to a remote MCP server. It is an **accelerator**, not a source of truth: GitHub remains authoritative, and clients should be able to fall back to their normal GitHub integration if GBF is unavailable.

## Why

A typical agent takeover can otherwise look like:

```text
model -> fetch file -> model -> fetch issue -> model -> fetch comments -> model -> fetch PR -> ...
```

GBF moves the mechanical GitHub fan-out into Code Mode:

```text
agent -> search (when needed) -> execute
                              |-> GitHub file
                              |-> GitHub issue/comments
                              |-> GitHub PR/checks
                              `-> compact result
```

Cloudflare's current `openApiMcpServer()` exposes two MCP tools: **`search`** and **`execute`**. `execute` runs model-written JavaScript in an isolated Worker sandbox; authentication and outbound GitHub requests stay in trusted host code.

## V1 safety model

V1 is deliberately boring:

- **read-only**: model-triggered requests may use only `GET` or `HEAD`
- **repository allowlist**: `/repos/{owner}/{repo}/...` must target a configured repository
- **repo-scoped search only**: `/search/*` queries must include `repo:owner/name`
- **host-side revalidation**: even if generated code asks for a mutation, the host rejects it
- **GitHub App auth**: the Worker mints short-lived installation tokens; no long-lived PAT is exposed to the sandbox
- **response cap**: oversized API responses are rejected with a hint to narrow/paginate
- **sandbox has no GitHub credential**

Code Mode is currently experimental upstream. GBF should therefore remain an optional fast path, never a required control-plane dependency.

## Upstream building blocks

GBF intentionally does not reimplement GitHub or MCP plumbing:

- Cloudflare `@cloudflare/codemode` + the official `codemode-mcp-openapi` pattern
- GitHub's official `github/rest-api-description` OpenAPI document
- GitHub App installation authentication

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
# fill in local test credentials
npm test
npm run typecheck
npm run dev
```

The remote MCP endpoint is `/mcp`; `/health` is unauthenticated and exposes no repository data.

## Configuration

Required Worker secrets/variables:

| Name | Purpose |
| --- | --- |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_INSTALLATION_ID` | Installation ID for the selected account/repositories |
| `GITHUB_PRIVATE_KEY` | GitHub App private key; secret, never commit |
| `GITHUB_ALLOWED_REPOS` | Comma-separated `owner/repo` allowlist |
| `MCP_BEARER_TOKEN` | Temporary V1 client authentication for `/mcp` |
| `GITHUB_RESPONSE_MAX_BYTES` | Optional response cap; defaults to 1,500,000 bytes |

V1 uses a static bearer token only as a staging bootstrap. Before broad multi-client rollout, replace this with a proper OAuth/Cloudflare Access flow.

## Status

Bootstrap only. No production deployment has been claimed yet.

See [`docs/SETUP.md`](docs/SETUP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and [`docs/ROLLOUT.md`](docs/ROLLOUT.md).

## License

MIT. Portions of the architecture and server pattern are adapted from Cloudflare's MIT-licensed `agents` Code Mode examples; see [`NOTICE`](NOTICE).
