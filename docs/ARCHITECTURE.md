# Architecture

## Goal

Reduce model-visible GitHub tool round trips while preserving GitHub as the technical source of truth.

The stable v0.2 deployment is local-first:

```text
MCP-capable client
       |
       | search / execute over HTTPS
       v
Cloudflare Tunnel (optional remote transport)
       |
       v
GitHub But Fast local server
       |
       | QuickJS sandbox -> host bridge
       v
host-side policy + GitHub App auth
       |
       v
api.github.com
```

Local MCP clients may connect directly to `127.0.0.1:8787/mcp` and skip the tunnel.

The repository also retains an optional Cloudflare Worker path, but the stable deployment does not require paid Dynamic Workers.

## MCP surface

GBF intentionally exposes only two tools:

- `execute` — runs model-written JavaScript in a disposable QuickJS runtime. The script can call only host-provided Code Mode functions such as `codemode.request()`.
- `search` — endpoint discovery against the filtered GitHub OpenAPI document.

The model never receives the GitHub App private key or installation token.

## Sandbox boundary

The local QuickJS runtime does not expose:

- Node `process`
- `require`
- filesystem access
- shell/process spawning
- arbitrary `fetch`
- environment variables
- GitHub credentials

Only explicit host functions resolved for the Code Mode server cross the boundary.

Each execution uses a disposable QuickJS runtime/context with memory, stack, and wall-time limits.

## Read-only defense in depth

1. The GitHub OpenAPI document is filtered before Code Mode sees it.
2. Only `/repos/*`, repo-scoped `/search/*`, and `/rate_limit` are present.
3. Only GET/HEAD operations are retained.
4. Every host-side request is checked again immediately before GitHub access.
5. Repository paths must match `GITHUB_ALLOWED_REPOS`.
6. Search must contain explicit `repo:owner/name` qualifiers from that same allowlist.
7. The GitHub App itself should be installed only on selected repositories with read-only permissions.
8. Oversized responses are rejected instead of flooding the model/client.

The GitHub App token exchange uses POST internally, but that operation is trusted-host implementation detail and is never exposed to generated code.

## Response normalization

GitHub's Contents API normally returns file contents as base64. That representation is inconvenient inside a minimal sandbox and caused real-world extra model/tool turns.

Stable v0.2 normalizes successful Contents API **file** responses before they enter the sandbox:

```text
GitHub base64 file response
    -> host-side UTF-8 decode
    -> compact { path, sha, size, encoding: "utf-8", content, html_url }
    -> sandbox/model
```

Directory listings and non-contents responses remain unchanged.

This keeps decoding out of the model's reasoning loop and avoids requiring `atob`, Node `Buffer`, or `TextDecoder` inside QuickJS.

## Freshness

GBF does not cache repository state as an authority substitute. Normal reads go directly to GitHub on each execution.

The public GitHub OpenAPI schema and GitHub App installation token may be cached locally for efficiency, but repository facts remain fresh reads.

## Concurrency and fan-out

GBF's optimization target is the **outer model/tool boundary**, not minimizing every internal HTTP request.

A single `execute` call may use `Promise.all()` to perform many independent GitHub reads concurrently, then filter/grep/slice the responses in the sandbox and return one compact result.

Accepted real-workload benchmark:

```text
1 outer execute
-> 21 internal GitHub reads
-> largest fan-out 19
-> ~3.05 s total sandbox elapsed
-> 0 failures
-> 0 truncation
```

See `docs/BENCHMARK.md`.

## Multi-agent

Multiple clients may share the same GBF endpoint because v0.2 has no shared mutation state. GitHub's own rate-limit and secondary-limit signals remain the backpressure authority.

GBF itself has no write locks or dispatch ownership because it cannot write.

If write operations are ever introduced, they should be a separate explicit mutation lane with approvals, scope ownership, and coordination rather than unrestricted Code Mode.

## Failure model

GBF failure should degrade **performance**, not correctness:

```text
GBF healthy
  -> use fast read path

GBF unavailable / client incompatibility / narrow policy rejection
  -> fall back to normal GitHub connector/API
  -> preserve the same GitHub-as-source-of-truth conclusion
```

The normal GitHub integration remains the write path even when GBF is healthy.
