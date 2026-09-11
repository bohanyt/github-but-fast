# GitHub But Fast

> GitHub, but with fewer model/tool round trips.

**GitHub But Fast (GBF)** is a read-only Code Mode gateway for GitHub. It lets an MCP-capable agent fan out many fresh GitHub reads inside one sandboxed `execute` call, filter the results there, and return only the compact context the model needs.

**Current stable line: `v0.2`** (`package.json` version `0.2.0`).

GBF is an **acceleration layer, not a source of truth**. GitHub remains authoritative. Keep the client's normal GitHub integration available for writes and as a fallback.

## Why

Without GBF, a repository takeover often becomes:

```text
model -> fetch file -> model -> fetch issue -> model -> fetch comments
      -> model -> fetch PR -> model -> fetch CI -> ...
```

With GBF:

```text
agent
  -> execute
       |-> many fresh GitHub reads in parallel
       |-> grep/filter/slice inside the sandbox
       `-> one compact result
  -> normal GitHub integration only when a write is needed
```

The stable MCP surface intentionally has only two tools:

- **`execute`** — the normal fast path. Prefer one call with `Promise.all()` for independent reads.
- **`search`** — OpenAPI endpoint discovery when genuinely needed.

## Real benchmark

A real Claude Opus ARTI Control Tower workload was used as the acceptance benchmark rather than a toy microbenchmark.

| Metric | Before response normalization | Stable v0.2 |
| --- | ---: | ---: |
| Outer GBF calls | 11 | **1** |
| Internal GitHub reads | ~45 | **21** |
| Largest parallel fan-out | 11 | **19** |
| Failed/retry calls | 2 | **0** |
| Output truncation | yes | **no** |
| Manual base64 decode | required | **none** |
| In-sandbox elapsed | multi-call | **~3.05 s total** |

The accepted v0.2 run covered the canonical branch, authority issue/comment tail, handoff comments, PR/issue state, code search, and ten source/doc files in one outer `execute` call. This is the primary success criterion: fewer model-visible round trips without sacrificing fresh GitHub reads.

See [`docs/BENCHMARK.md`](docs/BENCHMARK.md) for the benchmark gate.

## Safety model

GBF v0.2 is deliberately read-only:

- generated/model code may use only `GET` or `HEAD`;
- `/repos/{owner}/{repo}/...` is restricted to `GITHUB_ALLOWED_REPOS`;
- `/search/*` requires explicit allowlisted `repo:owner/name` qualifiers;
- canonical-path validation rejects path/host escape tricks;
- host-side policy revalidates every request immediately before GitHub access;
- the GitHub App should itself have read-only permissions and be installed only on selected repositories;
- GitHub App credentials and installation tokens never enter the QuickJS sandbox;
- oversized GitHub responses are rejected with a narrowing/pagination hint;
- GitHub Contents API file responses are normalized server-side to decoded UTF-8 `content` so clients do not need base64 helpers.

The local QuickJS sandbox does not expose Node `process`, `require`, arbitrary `fetch`, the filesystem, or a shell.

## Recommended deployment: local-first

The stable setup runs the sandbox on your own machine and exposes it remotely through a Cloudflare Tunnel when needed:

```text
ChatGPT / Claude / Cursor / other MCP client
                  |
                  | HTTPS
                  v
        Cloudflare Tunnel
                  |
                  v
        127.0.0.1:8787/mcp
                  |
                  v
       GBF local QuickJS
                  |
                  v
          GitHub App -> GitHub
```

This keeps the compute local, requires no paid Dynamic Workers plan, and lets the endpoint disappear naturally when the local process is stopped.

Cloudflare Worker support remains in the repository as an optional hosted path.

## Quick start

Requirements: Node.js 22+ and a read-only GitHub App installed on the repositories you want GBF to read.

```bash
npm install
```

Create `.env.local` (never commit it):

```env
GITHUB_APP_ID=...
GITHUB_INSTALLATION_ID=...
GITHUB_PRIVATE_KEY_FILE=...
GITHUB_ALLOWED_REPOS=owner/repo-a,owner/repo-b
GITHUB_RESPONSE_MAX_BYTES=1500000
MCP_BEARER_TOKEN=...
# Optional; enables OAuth discovery for ChatGPT/custom MCP clients.
GBF_PUBLIC_ORIGIN=https://gbf.example.com
GBF_HOST=127.0.0.1
GBF_PORT=8787
```

Local-only server:

```bash
npm start
```

Windows/local stack after placing portable `cloudflared.exe` under `tools/` and configuring a named tunnel called `gbf`:

```bash
npm run up
```

Health endpoint:

```text
GET http://127.0.0.1:8787/health
```

MCP endpoint:

```text
POST/GET https://YOUR-HOSTNAME/mcp
```

Authentication remains backward-compatible with `Authorization: Bearer <MCP_BEARER_TOKEN>`. Compatible clients may also use the optional `X-GBF-Token` API-key header. When `GBF_PUBLIC_ORIGIN` is configured, GBF additionally exposes an OAuth Authorization Code + PKCE flow with refresh-token support for hosted clients such as ChatGPT. See [`docs/CHATGPT.md`](docs/CHATGPT.md).

## Client usage

Once GBF is connected, this short instruction is usually enough:

```text
Use GitHub But Fast (GBF) for heavy GitHub reads so you do not burn many model-visible tool calls. Prefer one `execute` call with `Promise.all()` and filter/compact inside the sandbox. Use normal GitHub tooling only for writes or when GBF is unavailable. GitHub remains source of truth.
```

For Control Tower / multi-file review work, use the stronger template in [`docs/PROMPTING.md`](docs/PROMPTING.md).

### Practical rules for agents

- Prefer `execute` directly for known GitHub REST reads; do not call `search` reflexively.
- Fan out independent reads with `Promise.all()`.
- Grep/filter/slice **inside** the sandbox and return a compact object.
- Contents API file responses already contain decoded UTF-8 `content`; do not base64-decode them.
- Keep output below the client's tool-result truncation limit.
- For non-default canonical branches, prefer direct tree/contents reads plus sandbox filtering instead of assuming GitHub code search indexes that branch.
- Use the normal GitHub connector for comments, branches, PR mutations, merges, workflow reruns, or other writes.

## Common direct-read endpoints

These usually do not require `search` first:

```text
GET /repos/{owner}/{repo}/contents/{path}?ref={branch-or-sha}
GET /repos/{owner}/{repo}/issues/{number}
GET /repos/{owner}/{repo}/issues/{number}/comments?per_page=100
GET /repos/{owner}/{repo}/pulls/{number}
GET /repos/{owner}/{repo}/commits/{ref}
GET /repos/{owner}/{repo}/actions/runs
GET /search/code?q=...+repo:{owner}/{repo}
GET /rate_limit
```

## Development

```bash
npm test
npm run typecheck
npm run build
npm run smoke:local
```

CI covers Windows and Ubuntu. The Worker dry-run build is retained even though the recommended stable deployment is local-first.

## Project docs

- [`docs/PROMPTING.md`](docs/PROMPTING.md) — reusable prompts and read patterns
- [`docs/BENCHMARK.md`](docs/BENCHMARK.md) — acceptance benchmark and measurement rules
- [`docs/SETUP.md`](docs/SETUP.md) — setup checklist
- [`docs/GITHUB_APP.md`](docs/GITHUB_APP.md) — minimal read-only GitHub App configuration
- [`docs/CHATGPT.md`](docs/CHATGPT.md) — OAuth setup and disposable ChatGPT coexistence gate
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — trust boundaries and failure model
- [`docs/ROLLOUT.md`](docs/ROLLOUT.md) — client rollout gates
- [`CHANGELOG.md`](CHANGELOG.md) — stable milestones

## Non-goals

GBF v0.2 does **not** provide GitHub mutation tools, agent orchestration, a second source of truth, or unrestricted local shell/worktree access. If writes are ever added, they should be a separate, explicit, approval-aware lane rather than unrestricted Code Mode.

## License

MIT. Portions of the architecture and server pattern are adapted from Cloudflare's MIT-licensed Code Mode examples; see [`NOTICE`](NOTICE).
