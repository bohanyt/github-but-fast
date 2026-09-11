import { SignJWT, importPKCS8 } from "jose";

const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "github-but-fast/0.2";

export interface GithubAuthConfig {
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_PRIVATE_KEY: string;
}

type TokenCache = { token: string; expiresAtMs: number; cacheKey: string };
let tokenCache: TokenCache | null = null;

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function cacheKey(config: GithubAuthConfig): string {
  return `${config.GITHUB_APP_ID}:${config.GITHUB_INSTALLATION_ID}`;
}

async function createAppJwt(config: GithubAuthConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(normalizePrivateKey(config.GITHUB_PRIVATE_KEY), "RS256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(config.GITHUB_APP_ID)
    .sign(key);
}

export async function getInstallationToken(config: GithubAuthConfig): Promise<string> {
  const now = Date.now();
  const key = cacheKey(config);
  if (
    tokenCache &&
    tokenCache.cacheKey === key &&
    tokenCache.expiresAtMs - now > 120_000
  ) {
    return tokenCache.token;
  }

  const jwt = await createAppJwt(config);
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(config.GITHUB_INSTALLATION_ID)}/access_tokens`,
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
    expiresAtMs: Date.parse(payload.expires_at),
    cacheKey: key
  };
  return payload.token;
}

export const githubHeaders = (token: string): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": GITHUB_API_VERSION,
  "User-Agent": USER_AGENT
});
