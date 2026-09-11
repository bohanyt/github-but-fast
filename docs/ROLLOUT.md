# Rollout

## Stage A — source-only bootstrap

- public repository
- no secrets
- no Cloudflare deployment
- read-only policy unit tests
- dependency and type checks

## Stage B — private staging credentials

- GitHub App installed only on `bohanyt/arti-dev`
- minimum read permissions
- Cloudflare Worker secrets configured directly in Cloudflare
- temporary bearer authentication for MCP staging

Do not commit `.dev.vars`, PEM files, tokens, App private keys, or Cloudflare credentials.

## Stage C — standalone benchmark

Benchmark a representative ARTI context acquisition task. Success means materially fewer outer model/tool turns without sacrificing freshness or provenance.

Suggested workload:

- `AGENTS.md`
- `docs/CURRENT.md`
- authority Issue #133 + comments
- one target issue + comments
- canonical branch HEAD
- related PR metadata/changed files
- CI/check state

Record wall time, outer MCP calls, GitHub API calls, response/context bytes, and mismatches against direct GitHub reads.

## Stage D — multi-client

Test one shared GBF deployment from:

- Cursor
- Claude Code
- Codex/Astra harness
- a generic MCP inspector/client

Reads can run concurrently. V1 has no cross-agent locks because V1 cannot write.

## Stage E — ChatGPT gate

Because a previous custom-MCP experiment interfered with the normal GitHub connector in the ARTI Control Tower workflow, ChatGPT is test-first:

1. connect GBF only in a disposable/test conversation;
2. verify the built-in GitHub connector remains usable;
3. benchmark a real task;
4. only then consider enabling it for the Primary CT.

## Explicit non-goals for V1

- GitHub writes
- merge/comment/branch creation
- agent dispatch
- Durable Object coordination
- GitHub webhook cache
- LLM hosted inside the Worker
- Blacksmith CI runners
- replacing GitHub as source of truth
