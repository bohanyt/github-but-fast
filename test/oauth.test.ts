import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GbfOAuthService, normalizePublicOrigin, validateRedirectUri } from "../src/oauth";

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

async function registeredClient(service: GbfOAuthService) {
  const registration = await service.registerClient({
    redirect_uris: ["https://chatgpt.com/oauth/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "ChatGPT"
  });
  return String(registration.client_id);
}

describe("GBF OAuth compatibility", () => {
  it("publishes per-server read-only OAuth metadata with refresh support", () => {
    const service = new GbfOAuthService({
      publicOrigin: "https://gbf.artiberarti.com",
      ownerSecret: "owner-secret-1234567890"
    });

    expect(service.protectedResourceMetadata()).toMatchObject({
      resource: "https://gbf.artiberarti.com/mcp",
      authorization_servers: ["https://gbf.artiberarti.com"],
      scopes_supported: ["gbf:read", "offline_access"]
    });
    expect(service.authorizationServerMetadata()).toMatchObject({
      issuer: "https://gbf.artiberarti.com",
      authorization_endpoint: "https://gbf.artiberarti.com/oauth/authorize",
      token_endpoint: "https://gbf.artiberarti.com/oauth/token",
      registration_endpoint: "https://gbf.artiberarti.com/oauth/register",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"]
    });
  });

  it("registers a public client, enforces PKCE, issues access and refresh tokens", async () => {
    const service = new GbfOAuthService({
      publicOrigin: "https://gbf.artiberarti.com",
      ownerSecret: "owner-secret-1234567890"
    });
    const clientId = await registeredClient(service);
    const verifier = "v".repeat(64);
    const code = service.issueAuthorizationCode({
      clientId,
      redirectUri: "https://chatgpt.com/oauth/callback",
      codeChallenge: challenge(verifier),
      scope: "gbf:read offline_access"
    });

    const tokens = await service.redeemAuthorizationCode({
      code,
      clientId,
      redirectUri: "https://chatgpt.com/oauth/callback",
      codeVerifier: verifier
    });

    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.scope).toBe("gbf:read offline_access");
    expect(typeof tokens.refresh_token).toBe("string");
    expect(await service.verifyAccessToken(String(tokens.access_token))).toBe(true);

    const refreshed = await service.refresh({
      refreshToken: String(tokens.refresh_token),
      clientId
    });
    expect(await service.verifyAccessToken(String(refreshed.access_token))).toBe(true);
  });

  it("makes authorization codes one-time and rejects a wrong PKCE verifier", async () => {
    const service = new GbfOAuthService({
      publicOrigin: "https://gbf.artiberarti.com",
      ownerSecret: "owner-secret-1234567890"
    });
    const clientId = await registeredClient(service);
    const verifier = "a".repeat(64);
    const code = service.issueAuthorizationCode({
      clientId,
      redirectUri: "https://chatgpt.com/oauth/callback",
      codeChallenge: challenge(verifier)
    });

    await expect(
      service.redeemAuthorizationCode({
        code,
        clientId,
        redirectUri: "https://chatgpt.com/oauth/callback",
        codeVerifier: "b".repeat(64)
      })
    ).rejects.toThrow(/PKCE/);

    await expect(
      service.redeemAuthorizationCode({
        code,
        clientId,
        redirectUri: "https://chatgpt.com/oauth/callback",
        codeVerifier: verifier
      })
    ).rejects.toThrow(/invalid or expired/);
  });

  it("rejects unsafe registration redirects and foreign resources", async () => {
    const service = new GbfOAuthService({
      publicOrigin: "https://gbf.artiberarti.com",
      ownerSecret: "owner-secret-1234567890"
    });

    await expect(service.registerClient({ redirect_uris: ["http://evil.example/callback"] })).rejects.toThrow(
      /unsafe URI/
    );
    expect(validateRedirectUri("http://127.0.0.1:4000/callback")).toBe(true);
    expect(validateRedirectUri("https://example.com/callback")).toBe(true);
    expect(validateRedirectUri("javascript:alert(1)")).toBe(false);

    const clientId = await registeredClient(service);
    expect(() =>
      service.issueAuthorizationCode({
        clientId,
        redirectUri: "https://chatgpt.com/oauth/callback",
        codeChallenge: "c".repeat(43),
        resource: "https://example.com/mcp"
      })
    ).toThrow(/resource/);
  });

  it("requires an HTTPS origin without path material", () => {
    expect(normalizePublicOrigin("https://gbf.artiberarti.com/")).toBe("https://gbf.artiberarti.com");
    expect(() => normalizePublicOrigin("http://gbf.artiberarti.com")).toThrow(/https/);
    expect(() => normalizePublicOrigin("https://gbf.artiberarti.com/path")).toThrow(/without a path/);
  });

  it("compares the owner secret without exposing it", () => {
    const service = new GbfOAuthService({
      publicOrigin: "https://gbf.artiberarti.com",
      ownerSecret: "owner-secret-1234567890"
    });
    expect(service.ownerSecretMatches("owner-secret-1234567890")).toBe(true);
    expect(service.ownerSecretMatches("wrong")).toBe(false);
  });
});
