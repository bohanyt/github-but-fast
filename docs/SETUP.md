# Setup

This guide describes the stable v0.2 local-first setup.

## 1. Requirements

- Node.js 22+
- Git
- a GitHub App with read-only repository permissions
- optional: `cloudflared` portable binary for remote MCP access

## 2. Clone and install

```powershell
cd "C:\path\to\parent"
git clone https://github.com/bohanyt/github-but-fast.git "github but fast"
cd "github but fast"
npm install
```

## 3. GitHub App

Create a GitHub App and install it only on repositories GBF should read.

Recommended read-only repository permissions:

- Metadata
- Contents
- Issues
- Pull requests
- Actions
- Checks
- Commit statuses

Do not grant write permission just because a client can request it; GBF itself is read-only.

See [`GITHUB_APP.md`](GITHUB_APP.md).

## 4. Local environment

Create `.env.local` in the repository root. It is ignored by Git.

```env
GITHUB_APP_ID=...
GITHUB_INSTALLATION_ID=...
GITHUB_PRIVATE_KEY_FILE=C:\path\to\github-app-private-key.pem
GITHUB_ALLOWED_REPOS=owner/repo-a,owner/repo-b
GITHUB_RESPONSE_MAX_BYTES=1500000

MCP_BEARER_TOKEN=...

GBF_HOST=127.0.0.1
GBF_PORT=8787
```

Keep all credentials local. Never paste the GitHub App private key or MCP bearer token into prompts, issues, PRs, or chat logs.

GitHub-issued RSA private keys may be PKCS#1; GBF normalizes them in memory for the signing library and does not modify the original PEM file.

## 5. Verify source/runtime

```powershell
npm test
npm run typecheck
```

Start the local server:

```powershell
npm start
```

In another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health | Format-List
npm run smoke:local
```

Expected MCP tools are exactly:

```text
execute
search
```

## 6. Optional remote access with Cloudflare Tunnel

For clients that cannot reach localhost, use a Cloudflare Tunnel.

On Windows, the portable binary can live at:

```text
tools/cloudflared.exe
```

That path is ignored by Git.

Create/login/configure a named tunnel once. A minimal config points the public hostname to the local server:

```yaml
tunnel: YOUR-TUNNEL-ID
credentials-file: C:\Users\YOU\.cloudflared\YOUR-TUNNEL-ID.json

ingress:
  - hostname: gbf.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

After the tunnel is configured, stable v0.2 can start the local server and the named tunnel together:

```powershell
npm run up
```

By default the tunnel name is `gbf`. Override it with `GBF_TUNNEL_NAME` if necessary.

Stopping the local stack makes the remote MCP endpoint unavailable; this is expected for a workstation-first deployment.

## 7. Client authentication

Primary portable method:

```text
Authorization: Bearer <MCP_BEARER_TOKEN>
```

Some clients support API-key-style custom headers. GBF also accepts:

```text
X-GBF-Token: <MCP_BEARER_TOKEN>
```

However, hosted clients may restrict arbitrary header names. Prefer standard `Authorization` when possible.

## 8. Claude custom connector

Example settings for Claude Web when request headers are available:

```text
Name: GitHub But Fast
URL:  https://YOUR-HOSTNAME/mcp
Authentication: No sign-in
Transport: Streamable HTTP
Header: Authorization
Value: Bearer <MCP_BEARER_TOKEN>
```

After connecting, Claude should display exactly two tools: `Execute` and `Search`.

For serious benchmark/control-tower work, start a new chat after enabling the connector so the session definitely receives the current tool inventory.

## 9. Agent instruction

Minimal reusable instruction:

```text
Use GitHub But Fast (GBF) for heavy GitHub reads so you do not burn many model-visible tool calls. Prefer one `execute` call with `Promise.all()` and filter/compact inside the sandbox. Use normal GitHub tooling only for writes or when GBF is unavailable. GitHub remains source of truth.
```

See [`PROMPTING.md`](PROMPTING.md) for stronger templates.

## 10. Adding another project

To use GBF with another repository:

1. install/enable the same GitHub App on that repository;
2. add `owner/repo` to `GITHUB_ALLOWED_REPOS` in `.env.local`;
3. restart GBF;
4. run a read-only smoke against the new repo;
5. keep the normal GitHub integration available for writes.

No code change is required for each new repository.

## 11. Security checklist

Before exposing GBF remotely:

- GitHub App remains read-only;
- `GITHUB_ALLOWED_REPOS` contains only intended repositories;
- MCP auth token is long and random;
- private key and tunnel credentials are outside the repo;
- `/health` exposes no private repo names;
- remote endpoint is HTTPS;
- client is configured to use GBF only for reads;
- normal GitHub tooling remains the mutation lane.

## Optional Worker path

The repository still contains the earlier Cloudflare Worker implementation and Wrangler build path. It is optional and not required for the stable local-first workflow.
