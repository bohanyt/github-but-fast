# Setup checklist

This is the durable version of the initial rollout plan.

1. **Repository** — create `bohanyt/github-but-fast` (public, MIT). ✅
2. **Bootstrap Worker** — adapt Cloudflare's official Code Mode OpenAPI MCP example. IN PROGRESS
3. **Read policy** — expose only GET/HEAD repo/search/rate-limit operations. IN PROGRESS
4. **Tests** — policy/spec-filter tests plus TypeScript checks. IN PROGRESS
5. **Create GitHub App** — owner action required.
6. **GitHub App permissions** — start read-only: Metadata, Contents, Issues, Pull requests, Actions, Checks, and Commit statuses as needed.
7. **Install App** — start with `bohanyt/arti-dev` only.
8. **Record credentials** — App ID, Installation ID, generated private key. Never paste the private key into chat or commit it.
9. **Create/connect Cloudflare Worker** — connect this repository to Workers Builds or deploy with Wrangler.
10. **Configure Worker secrets** — `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_ALLOWED_REPOS`, `MCP_BEARER_TOKEN`.
11. **Deploy staging** — use `workers.dev` first; custom domain later.
12. **Standalone MCP smoke** — `/health`, initialize/list tools, verify only Code Mode read surface is exposed and mutations fail closed.
13. **ARTI benchmark** — compare normal GitHub tooling vs GBF on a real fresh-read/review task: wall time, outer tool turns, context size, correctness/freshness.
14. **Multi-client smoke** — Cursor, Claude Code, Codex/Astra; concurrent read test; inspect GitHub rate-limit behavior.
15. **ChatGPT Primary CT gate** — test GBF in a separate ChatGPT conversation first. Promote only if the normal GitHub connector remains available and GBF materially improves the benchmark.

## Manual owner steps

The first owner action needed after the bootstrap PR is ready is **Step 5: create the GitHub App**. Everything before that can be prepared without account secrets.
