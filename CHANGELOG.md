# Changelog

## v0.2.0 — Stable local-first read accelerator

Status: **stable for read-only MCP use**.

This is the first GBF line accepted against a real control-tower workload.

### Stable contract

- two MCP tools only: `execute` and `search`
- GitHub reads only (`GET` / `HEAD`)
- repository allowlist
- repo-scoped GitHub search
- host-side policy enforcement
- GitHub App installation authentication
- local QuickJS execution sandbox
- local-first runtime on `127.0.0.1:8787`
- optional Cloudflare Tunnel for remote MCP clients
- normal GitHub connector remains the write/fallback path

### Added / changed

- local QuickJS executor with no filesystem, shell, Node process/env, `require`, or arbitrary `fetch`
- Windows + Linux CI
- GitHub App PKCS#1 private-key compatibility
- local MCP smoke using one `execute` call with parallel reads
- one-command `npm run up` local server + named Cloudflare Tunnel startup
- public `/health` hardening
- Claude custom-connector compatibility through standard bearer auth
- server-side GitHub Contents API normalization from base64 to compact UTF-8 `content`
- benchmark and reusable prompting documentation

### Accepted benchmark

Real Claude Opus ARTI Control Tower read workload:

- outer GBF calls: **1**
- internal GitHub reads: **21**
- largest parallel fan-out: **19**
- in-sandbox elapsed: **~3.05 s total**
- failed/retry calls: **0**
- output truncation: **0**
- fallback: **none for reads**

The earlier run required 11 outer calls and hit base64-decoding failures/truncation; v0.2 response normalization removed that friction.

### Known boundaries

- no GitHub writes
- no local worktree/shell mutation lane
- GitHub code search should not be assumed to index a non-default canonical branch; use direct tree/contents reads plus sandbox filtering when branch authority matters
- hosted clients may impose their own tool-output caps or connector-auth restrictions
- ChatGPT side-by-side rollout with the built-in GitHub connector remains test-first

## Pre-stable bootstrap

Earlier commits established the Cloudflare Code Mode/OpenAPI prototype, host-side read policy, GitHub App auth, and optional Worker deployment path. Those experiments led to the local-first v0.2 stable contract above.
