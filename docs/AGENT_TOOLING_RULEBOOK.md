# Agent tooling rulebook

Operational memory from the 11 Sep 2026 GBF / ChatGPT / Claude / swarm experiments.

This document exists because several important behaviors are product-surface quirks that are not obvious from normal documentation. Treat these as empirical operating rules until a later retest disproves them.

## 1. Source-of-truth rule

- GitHub remains the technical source of truth.
- GBF is a read accelerator, not an authority layer.
- Writes, claims, leases, issue comments, branch creation, PR mutations, merges and workflow mutations belong to the normal GitHub path unless a future explicitly reviewed write-capable gateway replaces it.
- Never silently treat a cached/previous GBF result as a fresh authoritative write-time read.

## 2. Stable GBF read pattern

Preferred heavy-read pattern:

```text
one execute
  -> Promise.all(independent GitHub GET/HEAD reads)
  -> grep/filter/slice in the sandbox
  -> compact result back to the model
```

Rules:

- Prefer `execute` directly when endpoints are already known.
- Use `search` only for genuine endpoint/schema discovery.
- Keep output compact; do not return full bodies/arrays when IDs, states, selected lines or summaries are enough.
- GitHub Contents responses are already normalized by GBF to UTF-8 `content`; do not manually base64-decode them.
- For non-default canonical branches, prefer direct branch/tree/contents reads plus sandbox filtering. Do not assume GitHub code search indexes that branch.
- Do not let every swarm agent repeat the same full-repository takeover bundle if their lane only needs a bounded subset.

Accepted real benchmark (Claude Opus ARTI CT workload):

- 1 outer GBF call
- 21 internal GitHub reads
- max fan-out 19
- ~3.05 s in-sandbox total
- 0 failed/retry calls
- 0 output truncation
- 0 fallback for reads

The earlier pre-normalization run needed 11 outer calls and hit base64/manual-decoding and truncation failures.

## 3. Claude / Opus behavior — VERIFIED GOOD

Claude custom connector + normal GitHub can coexist in the same conversation.

Recommended split:

```text
GBF        -> heavy reads
normal GitHub -> writes / comments / PR mutations / fallback
```

For Claude/Opus:

- GBF `execute` + `search` are available as normal custom-connector tools once connected.
- Static bearer/header auth works for the existing connector setup.
- The Opus CT benchmark demonstrated real one-call takeover reads.
- This is currently the best environment for `GBF for reads + normal GitHub for writes` in one agent conversation.

## 4. ChatGPT Personal Plugin / custom MCP behavior — READ-ONLY WORKS, COEXISTENCE NOT RELIABLE

### Verified working

ChatGPT Personal Plugin can connect to GBF over OAuth and invoke GBF by itself.

Verified setup:

```text
Connection: Server URL
Authentication: OAuth
Registration: Dynamic Client Registration (DCR)
Default scopes:
  gbf:read
  offline_access
OIDC: off
```

The server successfully exposes OAuth discovery, DCR, PKCE S256 authorization, access tokens and refresh tokens. `/mcp` remains authenticated; do not switch to `No Auth`.

### Verified routing problem

ChatGPT did **not** reliably surface GBF and the built-in GitHub connector together across turns.

Observed sequence A:

```text
Turn 1: GBF selected/surfaced -> GBF works
Turn 2: request normal GitHub -> normal GitHub unavailable in that conversation/toolset
Turn 3: generic GitHub request -> ChatGPT routes back to GBF
```

Observed sequence B after renaming the MCP identity to avoid a literal `github` collision:

```text
Turn 1: normal GitHub -> works
Turn 2: request GBF -> GBF not surfaced; only normal GitHub remains
```

This means the custom MCP itself works, the built-in GitHub connector itself works, but **ChatGPT coexistence/routing between the two is not reliable on the current product surface**.

A previous ambiguous MCP identity (`name: "github"`) was corrected to `gbf-readonly`, and the display-name guidance was changed to `GBF Read Accelerator`. That cleanup is still correct and should remain, but it did not remove the higher-level ChatGPT routing limitation.

### Operational rule for ChatGPT

- Implementation agents that need writes: **use normal GitHub only**.
- Read-only adversaries/researchers: GBF may be used alone when the task is strictly read-only.
- Do not tell a ChatGPT agent to “search for the GBF plugin” if GBF tools are not surfaced. Either the toolset contains GBF or it does not.
- Do not depend on “GBF reads + built-in GitHub writes” inside one ChatGPT conversation until a future product retest proves coexistence.
- Do not deploy GBF into a critical CT/implementation chat merely because the plugin is installed account-wide.

Recommended fallback sentence for ChatGPT prompts:

```text
Use GBF only if its execute/search tools are already exposed in this session. Do not search for or install GBF. If unavailable, use the normal GitHub connector.
```

## 5. Plugin naming / provider-collision rule

Do not identify GBF's MCP server as `github`.

Current identity should remain distinct, e.g.:

```text
MCP server identity: gbf-readonly
ChatGPT display name: GBF Read Accelerator
```

Rationale: ChatGPT already has a built-in GitHub provider. Even if naming was not the whole routing problem, provider-name ambiguity is unnecessary and makes collision/dedup behavior harder to reason about.

## 6. ChatGPT OAuth rule

For ChatGPT Personal Plugins:

- Keep `/mcp` authenticated.
- Prefer OAuth over `No Auth`.
- DCR is currently supported by GBF and discovered by ChatGPT.
- `gbf:read` is the required read scope.
- `offline_access` is requested for refresh-token continuity.
- OIDC is not required for the single-owner GBF setup.
- The owner approval page accepts the existing local `MCP_BEARER_TOKEN`; that token must never be pasted into chat, GitHub issues, screenshots or public logs.
- Legacy static bearer auth remains useful for Claude/local smoke and is additive to OAuth.

## 7. ChatGPT custom MCP write limitation

Current practical rule for this setup: treat ChatGPT Personal GBF as read-only.

Even if a future plan/surface allows custom write MCPs, do **not** simply allow arbitrary model-written `execute` JavaScript to POST/PATCH/DELETE GitHub.

If a write-capable “GitHub Plus” gateway is built later, use:

```text
execute/search -> GET/HEAD only
explicit typed write tools -> comments, branches, commits, PRs, merges, workflow actions
```

Each write tool should use explicit repo allowlists, expected-head SHA / optimistic locking where relevant, approval-aware operations, and separate audit semantics.

## 8. Swarm request-throttle rule

Empirical observation from a Recantor swarm run:

- launching many heavy ChatGPT conversations/agents in a short burst can trigger a temporary `Too many requests` / “making requests too quickly” guardrail;
- the observed event happened during a multi-agent Recantor burst and was not evidence of GBF or GitHub failure.

Conservative operating rule (empirical, **not an official platform cap**):

- start ~3–4 heavy ChatGPT agents first;
- stagger additional starts instead of firing every agent at once;
- if the UI shows a temporary request-limit dialog, stop retry-spamming and let the cooldown clear;
- GBF can reduce model-visible GitHub call churn for read-only workloads, but it does not eliminate account-level ChatGPT conversation/request throttling.

## 9. GitHub API / GBF swarm concurrency rule

GBF can fan out many reads quickly, but do not create avoidable secondary-limit pressure:

- CT may do one broad takeover bundle;
- specialists should read only their lane;
- avoid several agents each launching identical 15–20 request bundles simultaneously;
- if GitHub starts rate-limiting, narrow/reduce concurrency rather than adding accounts to evade limits.

## 10. Long issue / authority-ledger rule

Large control-tower issues with hundreds of comments are operationally acceptable, but agents should not replay the entire history every takeover.

Preferred read pattern:

```text
issue body
+ latest 1–2 comment pages
+ exact historical comment IDs referenced by the current handoff/checkpoint
+ current canonical HEAD / relevant PR/files
```

Old comments remain immutable audit history. Periodic handoff/checkpoint comments should carry exact IDs so agents can reconstruct current authority without reading 400+ comments.

## 11. Project-routing rule

### ARTI DEV

- Primary/implementation ChatGPT agents: normal GitHub connector for reliability and writes.
- Opus CT2 / independent heavy reviewer: GBF for reads + normal GitHub for writes is the preferred environment.
- Do not let tooling experiments alter ARTI authority, Tier-3 boundaries, leases, or source-of-truth rules.

### Recantor

- ChatGPT swarm may use normal GitHub for implementation/write lanes.
- Read-only review lanes may use GBF where the client exposes it reliably.
- Stagger heavy agent starts to avoid temporary account-level request throttling.

## 12. Short reusable prompt snippets

### Claude / environments where coexistence is proven

```text
Use GitHub But Fast (GBF) for heavy GitHub reads to minimize model-visible tool calls. Prefer one execute call with Promise.all() and compact/filter inside the sandbox. Use the normal GitHub connector for writes, comments, claims, PR mutations, merges, or fallback. GitHub remains source of truth.
```

### ChatGPT implementation agent

```text
Use the normal GitHub connector as the authoritative read/write path. If GBF execute/search are already exposed in this session, you may use GBF for bounded read-only acceleration; do not search for or install GBF, and do not depend on GBF coexisting with normal GitHub for writes.
```

### ChatGPT read-only adversary

```text
Use GBF Read Accelerator only if execute/search are exposed. Prefer one execute call with Promise.all() and compact filtering. Do not write or mutate GitHub. If GBF is unavailable, use normal GitHub read-only fallback.
```

## 13. Retest conditions

Retest these rules when any of the following materially changes:

- ChatGPT plugin/app routing UI or tool-selection behavior;
- ChatGPT custom MCP plan entitlements;
- built-in GitHub connector behavior;
- Claude connector model/auth behavior;
- MCP auth/client-registration requirements;
- GBF changes from the read-only `search` + `execute` contract.

When retesting, use disposable conversations first. Never use the Primary ARTI CT or an active implementation lane as the first compatibility test.

## 14. Current status snapshot

As of 11 Sep 2026:

```text
GBF local runtime                         VERIFIED
Cloudflare Tunnel                         VERIFIED
Remote MCP handshake                      VERIFIED
Claude custom connector                   VERIFIED
Private allowlisted GitHub reads           VERIFIED
Server-side UTF-8 contents normalization   VERIFIED
Real CT benchmark                          PASS
ChatGPT OAuth/DCR installation              VERIFIED
ChatGPT GBF-only read                       VERIFIED
ChatGPT built-in GitHub-only usage          VERIFIED
ChatGPT GBF + built-in GitHub coexistence   NOT RELIABLE
ChatGPT write-capable GBF replacement       NOT DEPLOYED
```

The purpose of this rulebook is to preserve these findings so future agents do not rediscover the same product-surface behavior by accident.
