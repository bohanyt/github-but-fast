# Cloudflare setup

GBF v0.2 uses Cloudflare primarily as a **Tunnel transport** from remote MCP clients to the local GBF server.

The earlier Worker path remains optional.

## Recommended: Cloudflare Tunnel

Architecture:

```text
remote MCP client
    -> HTTPS hostname
    -> Cloudflare Tunnel
    -> 127.0.0.1:8787/mcp
    -> local GBF QuickJS
    -> GitHub App -> GitHub
```

No inbound router port is required; `cloudflared` creates an outbound connection to Cloudflare.

### Windows portable binary

If MSI installation is blocked, use the official portable Windows AMD64 executable and keep it at:

```text
tools/cloudflared.exe
```

That path is ignored by Git.

Verify the downloaded binary against the checksum published in the corresponding Cloudflare GitHub release before use.

### One-time login and tunnel creation

From the repository root:

```powershell
.\tools\cloudflared.exe tunnel login
.\tools\cloudflared.exe tunnel create gbf
.\tools\cloudflared.exe tunnel route dns gbf gbf.example.com
```

Keep the generated `cert.pem` and tunnel credential JSON outside the repository. Never commit or paste them into prompts.

### Example config

Cloudflare's default local config path is typically under `%USERPROFILE%\.cloudflared\config.yml`.

```yaml
tunnel: YOUR-TUNNEL-ID
credentials-file: C:\Users\YOU\.cloudflared\YOUR-TUNNEL-ID.json

ingress:
  - hostname: gbf.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Validate:

```powershell
.\tools\cloudflared.exe tunnel ingress validate
```

### Run

After `.env.local` and the tunnel are configured:

```powershell
npm run up
```

This starts both:

- GBF local server
- named Cloudflare Tunnel (`gbf` by default)

Override the tunnel name with `GBF_TUNNEL_NAME` when necessary.

### Smoke

Public health:

```powershell
Invoke-RestMethod https://gbf.example.com/health | Format-List
```

Expected fields include:

```text
ok      : True
service : github-but-fast
runtime : local
mode    : read-only
sandbox : quickjs
```

The public health response intentionally does not reveal the repository allowlist.

Then test the actual remote `/mcp` endpoint with an authenticated MCP client. A health check alone is not sufficient proof.

## MCP authentication

Preferred:

```http
Authorization: Bearer <MCP_BEARER_TOKEN>
```

GBF also accepts an optional `X-GBF-Token` header for clients that support arbitrary API-key request headers, but some hosted clients reject unapproved custom header names. Standard `Authorization` is the portable default.

## Availability model

The tunnel is deliberately workstation-first:

```text
GBF process running + cloudflared running -> remote MCP available
process stopped / laptop asleep           -> remote MCP unavailable
```

This is expected. GBF is not intended to become a correctness dependency; clients should fall back to their normal GitHub integration when the fast path is offline.

## Optional Cloudflare Worker path

The repository still contains:

- `wrangler.jsonc`
- Worker source/build path
- `npm run dev:worker`
- `npm run build`
- `npm run deploy:worker`

The Worker path originated from Cloudflare's Code Mode/OpenAPI MCP example and remains useful for experimentation or a future hosted deployment.

However, Dynamic Worker execution may require a paid Cloudflare Workers plan. The stable v0.2 local-first runtime avoids that requirement by running QuickJS locally.

Do not configure Worker secrets unless you intentionally choose the hosted path.

## Security checklist

- tunnel credentials stay outside the repository;
- `.env.local` and private keys stay local;
- public hostname terminates HTTPS at Cloudflare;
- GBF binds only to `127.0.0.1` by default;
- `/mcp` requires authentication;
- GitHub App is read-only and repository-scoped;
- normal GitHub tooling remains the mutation path.

## Sources

- Cloudflare Tunnel documentation — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- Cloudflare Tunnel configuration — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/configuration-file/
- Cloudflare Workers documentation — https://developers.cloudflare.com/workers/
