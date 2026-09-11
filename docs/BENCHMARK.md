# GBF benchmark gate

GBF exists to reduce **model-visible GitHub tool round trips**, not merely to make individual HTTP requests faster.

## Reference workload

Baseline observed on 2026-09-11: a Recantor implementation/review task took about **42m12s** and showed dozens of visible GitHub tool calls.

A representative research/review prompt should require a fresh read of multiple repository resources, for example:

- `AGENTS.md`
- `docs/CURRENT.md`
- one issue body plus all comments
- one PR current head/diff/status
- relevant implementation files
- CI/workflow state

## Success criteria

For the read/research phase:

- target **1–3 outer model/tool calls** total;
- internal GitHub fan-out is allowed and encouraged;
- GitHub remains fresh and authoritative;
- no stale cache may substitute for a required fresh read;
- correctness must not regress;
- normal GitHub tooling remains available as fallback.

A result that merely reduces latency per GitHub request while still exposing long sequential `Called tool` chains is **not** a GBF success.

## Measurement

Record both paths on the same or closely matched workload:

| Metric | Normal GitHub tooling | GBF |
| --- | ---: | ---: |
| Outer model/tool calls |  |  |
| Wall time |  |  |
| GitHub API requests |  |  |
| Context returned to model |  |  |
| Correct/fresh result |  |  |

The main optimization target is the first two rows. Internal GitHub API requests are secondary as long as rate limits remain healthy.

## Client gate

Before promoting GBF into a primary ChatGPT control-tower workflow:

1. verify remote MCP `search` + `execute` from a non-ChatGPT client;
2. run the same read bundle in one `execute` call;
3. test GBF in a disposable ChatGPT conversation;
4. verify the normal built-in GitHub connector is still available and usable in the same conversation;
5. compare tool-call count and wall time against baseline;
6. promote only if GBF materially improves the benchmark without connector-routing regressions.

## Independent model check

An independent model such as Claude Opus should be given the same MCP endpoint and asked to:

- list tools and confirm only `search` and `execute` are exposed;
- use one `execute` call with `Promise.all()` for several fresh GitHub reads;
- verify an out-of-allowlist repository is rejected;
- verify mutation attempts are rejected;
- report visible tool-call count and total elapsed time;
- avoid changing GitHub state.
