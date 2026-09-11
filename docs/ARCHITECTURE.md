# Architecture

## Goal

Reduce model/tool round trips while preserving GitHub as the technical source of truth.

```text
MCP-capable client
       |
       | search / execute
       v
GitHub But Fast (Cloudflare Worker)
       |
       | host-side policy + GitHub App auth
       v
api.github.com
```

`search` operates on a filtered GitHub OpenAPI document. `execute` runs generated JavaScript in Cloudflare's isolated Code Mode sandbox. The sandbox can call only the host-provided `codemode.request()` bridge; it never receives the GitHub App private key or installation token.

## Read-only defense in depth

1. The GitHub OpenAPI document is filtered before Code Mode sees it.
2. Only `/repos/*`, repo-scoped `/search/*`, and `/rate_limit` are present.
3. Only GET/HEAD operations are retained.
4. Every host-side request is checked again immediately before `fetch()`.
5. Repository paths must match `GITHUB_ALLOWED_REPOS`.
6. Search must contain explicit `repo:owner/name` qualifiers from that same allowlist.
7. The GitHub App itself should be installed only on selected repositories with read-only permissions.

The GitHub App token exchange uses POST internally, but this operation is not exposed to generated code and cannot mutate repositories.

## Freshness

V1 does not cache GitHub repository data. Each execute call reads GitHub directly. Only the public OpenAPI schema and short-lived installation token are cached in a Worker isolate.

## Multi-agent

Multiple clients can use the same endpoint concurrently because V1 has no shared write state. There is no Durable Object or lock manager in V1.

If write operations are ever introduced, they must not be placed inside unrestricted Code Mode. They require a separate explicit mutation lane, approvals, scope ownership, and coordination.

## Failure model

Fastlane failure must degrade performance, not correctness:

```text
GBF healthy -> use fast read path
GBF unavailable/stale/error -> client falls back to normal GitHub connector/API
```
