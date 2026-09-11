# ChatGPT personal-plugin setup

GBF's local/tunnel runtime can expose OAuth 2.1-compatible MCP discovery for ChatGPT while keeping the existing static bearer path for Claude/local clients.

## Why OAuth

ChatGPT's personal custom-plugin UI currently offers OAuth / Mixed / No Auth for remote MCP servers. GBF must stay authenticated because it can read private allowlisted repositories, so **do not use No Auth**.

When `GBF_PUBLIC_ORIGIN` is set, GBF exposes:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`
- `/oauth/register` (dynamic public-client registration)
- `/oauth/authorize` (Authorization Code + PKCE S256)
- `/oauth/token` (authorization-code + refresh-token grants)

`/mcp` returns `401` with `WWW-Authenticate` pointing at Protected Resource Metadata when no accepted credential is present.

The OAuth access token is short-lived and scoped to `gbf:read`; refresh tokens are issued when `offline_access` is requested. The existing `MCP_BEARER_TOKEN` remains accepted directly for Claude/local smoke and also acts as the single-owner approval secret on the GBF authorization page. It is never sent to the MCP client.

## Local configuration

Add this to `.env.local`:

```env
GBF_PUBLIC_ORIGIN=https://gbf.artiberarti.com
```

Keep the existing long random `MCP_BEARER_TOKEN`. Do not paste it into ChatGPT chat, GitHub, screenshots, or logs.

Restart the local stack after changing `.env.local`:

```powershell
npm run up
```

Expected health output includes:

```json
{"oauth":"enabled"}
```

## ChatGPT plugin form

Create a Personal plugin / custom MCP connection with a **routing-distinct display name**:

```text
Name: GBF Read Accelerator
Connection: Server URL
Server URL: https://gbf.artiberarti.com/mcp
Authentication: OAuth
```

Avoid naming the ChatGPT personal plugin simply `GitHub` or starting its display name with `GitHub`. ChatGPT already has a built-in GitHub connector and hosted routing can treat overlapping provider identities as substitutes. GBF's MCP server identity is deliberately `gbf-readonly` for the same reason.

During Scan Tools, ChatGPT should discover OAuth metadata and open the GBF authorization page. Enter the local `MCP_BEARER_TOKEN` only into that page. The server redirects back to ChatGPT with an authorization code; ChatGPT exchanges it using PKCE and can refresh access later.

Expected MCP tools remain exactly the Code Mode surface:

- `search`
- `execute`

Both are read-only by host policy. Use the normal GitHub connector for comments, branches, PR changes, merges, and other writes.

## Safety gate before ARTI use

Test in a disposable ChatGPT conversation first:

1. Built-in GitHub is visible before GBF is invoked.
2. GBF `execute` performs a private-repo read.
3. In the **next turn of the same chat**, built-in GitHub is still visible and can independently read the same repository.
4. GBF rejects a write/mutation attempt at the host policy boundary.
5. Built-in GitHub can perform a harmless test-repo write when explicitly requested.
6. Close/reopen or start another disposable chat and repeat the read/read coexistence check.
7. No `Forbidden`, routing disappearance, provider replacement, or plugin/tool collision occurs after GBF use.

A first-turn success is **not** sufficient. The known failure signature is: built-in GitHub is available initially, GBF is invoked once, then the next turn exposes only GBF and routes generic GitHub requests back to GBF. If that happens, stop rollout immediately; do not use GBF in ARTI/Recantor ChatGPT swarms.

Only after the multi-turn coexistence gate passes should GBF be used in ARTI/Recantor agent prompts. If GBF is unavailable, fall back to the normal GitHub connector; GitHub remains the source of truth.

## Compatibility

OAuth is additive. Existing clients may continue using:

```http
Authorization: Bearer <MCP_BEARER_TOKEN>
```

or the compatibility `X-GBF-Token` header where the client supports it. OAuth access tokens are distinct from the static bootstrap token.

## Current bounds

- Single-owner authorization only; this is not a multi-user identity system.
- Dynamic client registration is supported for compatibility. A future release can add CIMD if needed.
- OAuth authorization codes are one-time and short-lived in memory. A GBF restart during the browser authorization step requires restarting that step.
- Access/refresh/client-registration tokens are signed from a key derived from the existing local secret, so no additional secret file is required.
- ChatGPT's built-in GitHub coexistence is a product-routing property outside GBF's host policy, so the multi-turn gate remains mandatory after connector or ChatGPT updates.
