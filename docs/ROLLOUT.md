# Rollout

## Current status

Stable v0.2 is accepted for read-only local-first MCP use.

Completed:

- public repository and MIT licensing
- read-only host policy + tests
- GitHub App auth
- local QuickJS executor
- Windows + Linux CI
- remote Cloudflare Tunnel path
- standalone remote MCP smoke
- Claude custom connector
- real Opus Control Tower benchmark
- server-side UTF-8 contents normalization
- one-command local runtime (`npm run up`)

Still test-first / not globally promoted:

- ChatGPT Primary Control Tower rollout alongside the built-in GitHub connector
- broader multi-client soak across every intended client
- any future write/mutation lane

## Stage A — source/bootstrap — COMPLETE

- public repository
- no committed secrets
- read-only policy unit tests
- type checks
- Worker dry-run build retained

## Stage B — GitHub App and local runtime — COMPLETE

- read-only GitHub App
- selected-repository installation
- `.env.local` credentials
- local QuickJS sandbox
- `npm start` / `npm run smoke:local`

## Stage C — remote MCP — COMPLETE

- Cloudflare Tunnel -> local `127.0.0.1:8787`
- HTTPS remote `/mcp`
- bearer authentication
- public `/health` without repository allowlist disclosure
- remote `search` + `execute` smoke

## Stage D — real benchmark — COMPLETE for Claude/Opus

Accepted workload: real ARTI Control Tower fresh-read/review bundle.

Stable v0.2 result:

- 1 outer `execute`
- 21 internal reads
- largest fan-out 19
- ~3.05 s in-sandbox elapsed
- zero failures/retries
- zero output truncation
- zero read fallback

See [`BENCHMARK.md`](BENCHMARK.md).

## Stage E — reusable multi-project usage — ACTIVE

For each new repository/project:

1. install/enable the GitHub App on the repository;
2. add it to `GITHUB_ALLOWED_REPOS`;
3. restart GBF;
4. run a read smoke;
5. tell the agent to use GBF for heavy reads and normal GitHub tooling for writes.

Reusable prompt templates are in [`PROMPTING.md`](PROMPTING.md).

## Stage F — ChatGPT gate — PENDING

Because a previous custom-MCP experiment interfered with the normal GitHub connector in the ARTI Control Tower workflow, ChatGPT remains test-first:

1. connect GBF only in a disposable/test conversation;
2. verify the built-in GitHub connector remains usable;
3. run a real fresh-read benchmark;
4. verify normal GitHub writes still route through the built-in connector;
5. only then consider enabling GBF in the Primary CT.

Failure here does not invalidate GBF for Claude/Cursor/other clients; it means the ChatGPT rollout path stays disabled until connector routing is safe.

## Explicit non-goals for stable v0.2

- GitHub writes through Code Mode
- merge/comment/branch creation through GBF
- agent dispatch/orchestration
- unrestricted local shell/worktree access
- Durable Object coordination
- GitHub webhook cache as source of truth
- hosting an LLM inside GBF
- replacing GitHub as source of truth

## Upgrade policy

Do not add helpers or abstractions merely because they sound useful. Stable v0.2 already achieved the one-outer-call target on the reference workload.

Add new surface only when a repeated real workload demonstrates a concrete bottleneck, and preserve the read-only/fallback contract.
