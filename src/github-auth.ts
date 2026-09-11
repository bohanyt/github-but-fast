import { SignJWT, importPKCS8 } from "jose";

const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "github-but-fast/0.1";

type TokenCache = { token: string; expiresAtMs: number };
let tokenCache: TokenCache | null = null;

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

async function createAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(normalizePrivateKey(env.GITHUB_PRIVATE_KEY), "RS256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(env.GITHUB_APP_ID)
    .sign(key);
}

export async function getInstallationToken(env: Env): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - now > 120_000) return tokenCache.token;

  const jwt = await createAppJwt(env);
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(env.GITHUB_INSTALLATION_ID)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to mint GitHub installation token (${response.status}): ${body.slice(0, 500)}`
    );
  }

  const payload = (await response.json()) as { token?: string; expires_at?: string };
  if (!payload.token || !payload.expires_at) {
    throw new Error("GitHub installation token response was missing token or expires_at");
  }

  tokenCache = {
    token: payload.token,
    expiresAtMs: Date.parse(payload.expires_at)
  };
  return payload.token;
}

export const githubHeaders = (token: string): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": GITHUB_API_VERSION,
  "User-Agent": USER_AGENT
});
