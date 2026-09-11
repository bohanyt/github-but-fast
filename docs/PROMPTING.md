# Prompting GBF

GitHub But Fast (GBF) is a read-only acceleration path for GitHub-heavy agent work. GitHub itself remains the technical source of truth.

## Short prompt

Use this when the client already has GBF connected:

```text
Use GitHub But Fast (GBF) for heavy GitHub reads so you do not burn many model-visible tool calls. Prefer one `execute` call with `Promise.all()` and filter/compact inside the sandbox. Use normal GitHub tooling only for writes or when GBF is unavailable. GitHub remains source of truth.
```

## Stronger control-tower prompt

```text
Use GitHub But Fast (GBF) as the default READ path for fresh GitHub inspection.

- Prefer one `execute` call that fans out independent reads with `Promise.all()`.
- Filter, grep, slice, and summarize inside the sandbox before returning data.
- Use `search` only when the endpoint is genuinely unknown.
- Do not rely on GitHub code search for non-default canonical branches when direct tree/contents reads are available.
- Keep results compact enough to avoid client-side tool-output truncation.
- If GBF fails, fall back to the normal GitHub integration without changing the technical conclusion.
- Use normal GitHub tooling for writes, comments, PR mutations, merges, dispatches, or any action GBF cannot perform.
- GitHub remains the authoritative source of truth; GBF is only an acceleration layer.
```

## Expected tool shape

Stable v0.2 exposes exactly two MCP tools:

- `execute` — run sandboxed JavaScript against the read-only GitHub bridge; this should handle most normal work.
- `search` — discover OpenAPI endpoints when needed; it is not expected on every task.

Typical fresh-read flow:

```text
agent
  -> execute
       -> parallel GitHub reads
       -> in-sandbox filtering
       -> compact result
  -> normal GitHub connector only if a write is required
```

## Stable read patterns

Common reads can be used directly from `execute` without endpoint discovery:

```text
GET /repos/{owner}/{repo}/contents/{path}?ref={branch-or-sha}
GET /repos/{owner}/{repo}/issues/{number}
GET /repos/{owner}/{repo}/issues/{number}/comments?per_page=100
GET /repos/{owner}/{repo}/pulls/{number}
GET /repos/{owner}/{repo}/commits/{ref}
GET /repos/{owner}/{repo}/actions/runs
GET /search/code?q=...+repo:{owner}/{repo}
```

Contents-file responses are normalized by GBF to decoded UTF-8 `content`; agents should not manually base64-decode them.

## Example multi-read execute strategy

Conceptually:

```js
async () => {
  const [agents, current, issue, comments] = await Promise.all([
    codemode.request({ method: "GET", path: "/repos/OWNER/REPO/contents/AGENTS.md", query: { ref: "BRANCH" } }),
    codemode.request({ method: "GET", path: "/repos/OWNER/REPO/contents/docs/CURRENT.md", query: { ref: "BRANCH" } }),
    codemode.request({ method: "GET", path: "/repos/OWNER/REPO/issues/123" }),
    codemode.request({ method: "GET", path: "/repos/OWNER/REPO/issues/123/comments", query: { per_page: 100 } })
  ]);

  return {
    agents: agents.content,
    current: current.content,
    issue: { title: issue.title, body: issue.body },
    latestComments: comments.slice(-12).map(({ id, body }) => ({ id, body }))
  };
}
```

The exact code should be adapted to the task. The invariant is: fan out internally, return only what the model needs.

## What GBF is not

GBF v0.2 does not write to GitHub. It should not be used for:

- issue/PR comments
- branch or PR creation
- merges
- workflow reruns
- dispatch/coordination writes
- secrets or admin operations

Use the client's normal GitHub integration for those actions.
