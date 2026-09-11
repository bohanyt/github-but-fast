# Cloudflare staging setup

Do this only after the source bootstrap has been accepted/merged and the GitHub App from [`GITHUB_APP.md`](GITHUB_APP.md) exists.

## 1. Import the repository

In Cloudflare:

**Workers & Pages → Create application → Import a repository**

Connect/authorize the GitHub account if needed, then select:

`bohanyt/github-but-fast`

The Cloudflare Worker/project name must be exactly:

`github-but-fast`

This matches `wrangler.jsonc`; Cloudflare Workers Builds requires the dashboard Worker name and Wrangler `name` to match.

Use `main` as the production branch after the bootstrap PR is merged.

## 2. Build/deploy settings

The repository already contains `wrangler.jsonc`.

Recommended staging configuration:

```text
Build command: npm test && npm run typecheck
Deploy command: npx wrangler deploy
Preview deploy command: npx wrangler versions upload
```

Cloudflare may provide the deploy/preview commands automatically. Do not add a second framework or Pages project; this is a Worker.

## 3. Variables and secrets

Open the Worker:

**Settings → Variables and Secrets → Add**

### Secrets

Add these as **Secret** values:

```text
GITHUB_PRIVATE_KEY
MCP_BEARER_TOKEN
```

For `GITHUB_PRIVATE_KEY`, paste the complete PEM, including the BEGIN/END lines.

Generate `MCP_BEARER_TOKEN` as a long random value. It is temporary staging client authentication, not a GitHub token.

### Server-side configuration

These can be normal variables, or secrets if you prefer not to expose repository names/configuration in the dashboard:

```text
GITHUB_APP_ID=<app id>
GITHUB_INSTALLATION_ID=<installation id>
GITHUB_ALLOWED_REPOS=bohanyt/arti-dev
GITHUB_RESPONSE_MAX_BYTES=1500000
```

Never put `GITHUB_PRIVATE_KEY` or `MCP_BEARER_TOKEN` into `wrangler.jsonc` or the public repository.

## 4. Deploy staging

Use the default `workers.dev` hostname first. Do not configure a custom `artiberarti.com` hostname until the standalone benchmark passes.

Expected public health endpoint:

```text
https://<worker>.workers.dev/health
```

Expected MCP endpoint:

```text
https://<worker>.workers.dev/mcp
```

`/health` requires no auth and exposes no repository data. `/mcp` requires:

```http
Authorization: Bearer <MCP_BEARER_TOKEN>
```

## 5. First smoke

Before connecting an AI client broadly:

1. `/health` returns `ok: true`, `mode: read-only`;
2. unauthenticated `/mcp` returns 401;
3. authenticated MCP initialize/list-tools succeeds;
4. Code Mode exposes the OpenAPI `search` + `execute` surface;
5. GET against `bohanyt/arti-dev` works;
6. POST/PUT/PATCH/DELETE attempts fail closed;
7. GET against a repo outside `GITHUB_ALLOWED_REPOS` fails closed;
8. global `/search/*` without `repo:bohanyt/arti-dev` fails closed;
9. binary/oversized responses fail with a bounded structured error.

Only then move to the ARTI benchmark.

## 6. Authentication after staging

The static `MCP_BEARER_TOKEN` is deliberately a bootstrap mechanism. Before broad multi-client use, evaluate proper remote-MCP OAuth / Cloudflare Access so clients can authenticate without sharing one static bearer token.

## Sources

- Cloudflare Workers Builds — https://developers.cloudflare.com/workers/ci-cd/builds/
- Cloudflare Git integration — https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
- Cloudflare Secrets — https://developers.cloudflare.com/workers/configuration/secrets/
