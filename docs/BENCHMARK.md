# GBF benchmark gate

GBF exists to reduce **model-visible GitHub tool round trips**, not merely to make individual HTTP requests faster.

## Reference workload

Initial baseline observed on 2026-09-11: a Recantor implementation/review task took about **42m12s** and showed dozens of visible GitHub tool calls.

A representative research/review workload should require a fresh read of several independent repository resources, such as:

- `AGENTS.md`
- `docs/CURRENT.md`
- an authority issue plus recent comments
- canonical branch/head state
- related PR/issue/CI state
- multiple implementation files

## Success criteria

For the read/research phase:

- target **1–3 outer model/tool calls** total;
- internal GitHub fan-out is allowed and encouraged;
- GitHub remains fresh and authoritative;
- no stale cache may substitute for a required fresh read;
- correctness must not regress;
- normal GitHub tooling remains available as fallback and as the write path.

A result that merely reduces latency per GitHub request while still exposing long sequential `Called tool` chains is **not** a GBF success.

## Accepted v0.2 benchmark

The accepted stable benchmark used a real Claude Opus ARTI Control Tower takeover/read workload.

### Run 1 — before server-side contents normalization

| Metric | Result |
| --- | ---: |
| Outer GBF calls | 11 |
| Productive reads | 7 |
| Internal GitHub reads | ~45 |
| Largest fan-out | 11 |
| Failed sandbox calls | 2 |
| Debug/manual-decode overhead | yes |
| Output truncation | yes |
| Fallback | manual base64 decode |

The primary failure was representation friction: GitHub Contents API returned base64, while the minimal QuickJS sandbox intentionally lacked browser/Node decoding helpers such as `atob`, `Buffer`, and `TextDecoder`.

### Run 2 — stable v0.2

After server-side UTF-8 contents normalization, the same class of ARTI CT workload was repeated.

| Metric | Stable v0.2 result |
| --- | ---: |
| Outer GBF calls | **1** |
| Internal GitHub reads | **21** |
| Largest fan-out | **19** |
| Failed/retry calls | **0** |
| `search` tool calls | **0** |
| In-sandbox elapsed | **~3.05 s total** |
| Output truncated | **no** |
| Fallback needed | **none** |

The single `execute` covered, in one outer call:

- canonical branch state;
- authority issue and comment tail;
- handoff/proposal/advisory comments;
- open PRs and issues;
- code search;
- ten source/doc files;
- in-sandbox grep/filtering of the verification anchors.

All ten Contents API file reads returned decoded UTF-8 `content` rather than base64.

**Acceptance verdict:** stable v0.2 meets the original "one execute call per CT fresh-read" goal on this real workload.

## Interpretation

The main bottleneck moved from GitHub round-trip sequencing to the model/client boundary:

```text
before:
model -> GitHub -> model -> GitHub -> model -> GitHub ...

stable v0.2:
model -> execute -> ~20 fresh GitHub reads + filtering -> model
```

This is the intended architecture.

Internal API request count remains a secondary metric as long as GitHub rate limits remain healthy. Do not artificially serialize or throttle a healthy fan-out merely to reduce the internal count.

## Known benchmark caveats

- Client-side tool-output caps still exist. Filter/slice inside `execute` instead of returning large raw bodies.
- GitHub code search should not be assumed to discover content on a non-default canonical branch. When branch authority matters, use direct tree/contents reads and sandbox grep/filtering.
- Benchmark elapsed time above is in-sandbox/runtime time, not total model reasoning wall-clock time.
- A benchmark pass does not prove every client has identical connector behavior.

## Regression gate

A future GBF change should not be promoted as stable if the representative workload regresses materially on any of these without a clear justification:

- outer read-phase calls >3;
- repeated avoidable sandbox/tool failures;
- manual base64/content decoding by the model;
- frequent output truncation;
- stale/non-authoritative repository state;
- loss of the normal GitHub write/fallback path.

## ChatGPT gate

ChatGPT remains a separate rollout gate because a previous custom-MCP experiment interfered with the normal GitHub connector in an ARTI Control Tower workflow.

Before enabling GBF in a primary ChatGPT CT:

1. connect GBF in a disposable/test conversation;
2. verify built-in GitHub remains available and usable in the same conversation;
3. benchmark a real fresh-read task;
4. promote only if connector routing stays healthy and GBF materially improves the read phase.
