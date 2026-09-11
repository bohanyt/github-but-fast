# Local-first GBF on Windows

GBF can run on Bohan's Windows laptop and use Cloudflare only as an optional free Tunnel. No Cloudflare Workers Paid plan is required for this mode.

## Why

The optimization target is **model-visible tool round trips**, not raw GitHub request count. One `execute` call may fan out many fresh GitHub GETs inside a local QuickJS sandbox, filter the results there, and return one compact payload to the model.

## Requirements

- Node.js 24 (22+ is supported; CI uses 24)
- Git
- the existing `Bohan GitHub But Fast` GitHub App installation
- the downloaded GitHub App private-key PEM kept only on the local machine

## Configure

```powershell
Copy-Item .env.local.example .env.local
```

Edit `.env.local` locally. Required values:

```text
GITHUB_APP_ID=<numeric app id>
GITHUB_INSTALLATION_ID=160765888
GITHUB_PRIVATE_KEY_FILE=C:\path\to\your.private-key.pem
GITHUB_ALLOWED_REPOS=bohanyt/arti-dev,bohanyt/recantor
GITHUB_RESPONSE_MAX_BYTES=1500000
MCP_BEARER_TOKEN=<long random secret>
GBF_HOST=127.0.0.1
GBF_PORT=8787
```

Generate a 32-byte bearer token in PowerShell without sending it anywhere:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

`.env.local` and `*.pem` are ignored by Git.

## Start

```powershell
npm install
npm start
```

The server binds loopback only:

```text
health  http://127.0.0.1:8787/health
MCP     http://127.0.0.1:8787/mcp
```

Smoke health:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Expected shape:

```json
{
  "ok": true,
  "service": "github-but-fast",
  "runtime": "local",
  "mode": "read-only",
  "sandbox": "quickjs"
}
```

## Security boundary

Model-written code runs in QuickJS/WASM, not Node's global context. Guest code has no `process`, `require`, filesystem, shell, or arbitrary `fetch`. Its only useful external capability is the host-provided Code Mode tool namespace, whose GitHub calls are revalidated by the existing read-only repo policy.

The host retains the GitHub App private key and installation token. They are never inserted into the QuickJS guest.

## Remote clients

Cursor/Claude/Codex running on the same PC can use localhost directly. ChatGPT and cloud agents cannot reach localhost; after local smoke succeeds, expose `/mcp` through an authenticated Cloudflare Tunnel while keeping GBF bound to `127.0.0.1`.

Do not configure the tunnel until local MCP smoke is green.
