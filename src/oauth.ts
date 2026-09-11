import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Application, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";

const READ_SCOPE = "gbf:read";
const OFFLINE_SCOPE = "offline_access";
const CLIENT_AUDIENCE = "gbf-oauth-client-registration";
const REFRESH_AUDIENCE = "gbf-oauth-refresh";
const ACCESS_TTL_SECONDS = 15 * 60;
const AUTH_CODE_TTL_MS = 2 * 60 * 1000;
const REFRESH_TTL = "30d";
const CLIENT_TTL = "365d";

export interface OAuthConfig {
  publicOrigin: string;
  ownerSecret: string;
}

type RegisteredClient = {
  clientId: string;
  redirectUris: string[];
  clientName: string | null;
};

type PendingCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  expiresAt: number;
};

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeSecretEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function oauthError(response: Response, status: number, error: string, description: string) {
  response.status(status).json({ error, error_description: description });
}

export function normalizePublicOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("GBF_PUBLIC_ORIGIN must use https://");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("GBF_PUBLIC_ORIGIN must not contain credentials, query, or fragment");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("GBF_PUBLIC_ORIGIN must be an origin without a path");
  }
  return url.origin;
}

export function validateRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost";
}

function normalizeScope(raw: string | undefined): string {
  const requested = new Set((raw ?? READ_SCOPE).split(/\s+/).filter(Boolean));
  if (!requested.has(READ_SCOPE)) throw new Error(`scope must include ${READ_SCOPE}`);
  for (const scope of requested) {
    if (scope !== READ_SCOPE && scope !== OFFLINE_SCOPE) {
      throw new Error(`unsupported scope: ${scope}`);
    }
  }
  return [READ_SCOPE, requested.has(OFFLINE_SCOPE) ? OFFLINE_SCOPE : null]
    .filter(Boolean)
    .join(" ");
}

function validCodeVerifier(value: string): boolean {
  return value.length >= 43 && value.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(value);
}

export class GbfOAuthService {
  readonly origin: string;
  readonly resource: string;
  private readonly key: Uint8Array;
  private readonly ownerSecret: string;
  private readonly pendingCodes = new Map<string, PendingCode>();

  constructor(config: OAuthConfig) {
    this.origin = normalizePublicOrigin(config.publicOrigin);
    this.resource = `${this.origin}/mcp`;
    this.ownerSecret = config.ownerSecret;
    this.key = createHash("sha256").update(`gbf-oauth-v1\0${config.ownerSecret}`).digest();
  }

  protectedResourceMetadata() {
    return {
      resource: this.resource,
      authorization_servers: [this.origin],
      scopes_supported: [READ_SCOPE, OFFLINE_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "GitHub But Fast"
    };
  }

  authorizationServerMetadata() {
    return {
      issuer: this.origin,
      authorization_endpoint: `${this.origin}/oauth/authorize`,
      token_endpoint: `${this.origin}/oauth/token`,
      registration_endpoint: `${this.origin}/oauth/register`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [READ_SCOPE, OFFLINE_SCOPE],
      authorization_response_iss_parameter_supported: true
    };
  }

  async registerClient(input: unknown): Promise<Record<string, unknown>> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("registration body must be an object");
    }
    const body = input as Record<string, unknown>;
    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 8) {
      throw new Error("redirect_uris must contain 1..8 entries");
    }
    const redirectUris = body.redirect_uris.map(String);
    if (!redirectUris.every(validateRedirectUri)) throw new Error("redirect_uris contains an unsafe URI");
    if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
      throw new Error("only public clients with token_endpoint_auth_method=none are supported");
    }
    const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.map(String) : ["authorization_code"];
    if (grantTypes.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")) {
      throw new Error("unsupported grant type");
    }
    const responseTypes = Array.isArray(body.response_types) ? body.response_types.map(String) : ["code"];
    if (responseTypes.some((type) => type !== "code")) throw new Error("unsupported response type");

    const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : null;
    const clientId = await new SignJWT({
      kind: "client",
      redirect_uris: redirectUris,
      client_name: clientName
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.origin)
      .setAudience(CLIENT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(CLIENT_TTL)
      .sign(this.key);

    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: clientName ?? undefined
    };
  }

  async verifyClient(clientId: string): Promise<RegisteredClient> {
    const { payload } = await jwtVerify(clientId, this.key, {
      issuer: this.origin,
      audience: CLIENT_AUDIENCE,
      algorithms: ["HS256"]
    });
    if (payload.kind !== "client" || !Array.isArray(payload.redirect_uris)) {
      throw new Error("invalid client registration");
    }
    const redirectUris = payload.redirect_uris.map(String);
    if (!redirectUris.every(validateRedirectUri)) throw new Error("registered redirect URI is unsafe");
    return {
      clientId,
      redirectUris,
      clientName: typeof payload.client_name === "string" ? payload.client_name : null
    };
  }

  ownerSecretMatches(value: string): boolean {
    return safeSecretEqual(value, this.ownerSecret);
  }

  issueAuthorizationCode(input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    scope?: string;
    resource?: string;
  }): string {
    if (!input.codeChallenge || !/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) {
      throw new Error("PKCE S256 code_challenge is required");
    }
    const scope = normalizeScope(input.scope);
    const resource = input.resource || this.resource;
    if (resource !== this.resource) throw new Error("resource does not match GBF MCP endpoint");
    const code = Buffer.from(randomBytes(32)).toString("base64url");
    this.pendingCodes.set(code, {
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scope,
      resource,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS
    });
    return code;
  }

  async redeemAuthorizationCode(input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    resource?: string;
  }) {
    const pending = this.pendingCodes.get(input.code);
    this.pendingCodes.delete(input.code);
    if (!pending || pending.expiresAt < Date.now()) throw new Error("authorization code is invalid or expired");
    if (pending.clientId !== input.clientId || pending.redirectUri !== input.redirectUri) {
      throw new Error("authorization code binding mismatch");
    }
    if (input.resource && input.resource !== pending.resource) throw new Error("resource mismatch");
    if (!validCodeVerifier(input.codeVerifier)) throw new Error("invalid PKCE code_verifier");
    if (sha256Base64Url(input.codeVerifier) !== pending.codeChallenge) throw new Error("PKCE verification failed");
    await this.verifyClient(input.clientId);
    return this.issueTokens(input.clientId, pending.scope);
  }

  async refresh(input: { refreshToken: string; clientId: string; scope?: string; resource?: string }) {
    if (input.resource && input.resource !== this.resource) throw new Error("resource mismatch");
    await this.verifyClient(input.clientId);
    const { payload } = await jwtVerify(input.refreshToken, this.key, {
      issuer: this.origin,
      audience: REFRESH_AUDIENCE,
      algorithms: ["HS256"]
    });
    if (payload.kind !== "refresh" || payload.client_id !== input.clientId || typeof payload.scope !== "string") {
      throw new Error("invalid refresh token");
    }
    const original = normalizeScope(payload.scope);
    const requested = input.scope ? normalizeScope(input.scope) : original;
    const originalSet = new Set(original.split(" "));
    if (requested.split(" ").some((scope) => !originalSet.has(scope))) {
      throw new Error("refresh scope cannot expand the original grant");
    }
    return this.issueTokens(input.clientId, requested);
  }

  async verifyAccessToken(token: string): Promise<boolean> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.origin,
        audience: this.resource,
        algorithms: ["HS256"]
      });
      if (payload.kind !== "access" || typeof payload.scope !== "string") return false;
      return new Set(payload.scope.split(" ")).has(READ_SCOPE);
    } catch {
      return false;
    }
  }

  private async issueTokens(clientId: string, scope: string) {
    const normalizedScope = normalizeScope(scope);
    const accessToken = await new SignJWT({ kind: "access", scope: normalizedScope, client_id: clientId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.origin)
      .setAudience(this.resource)
      .setSubject("gbf-owner")
      .setIssuedAt()
      .setJti(Buffer.from(randomBytes(16)).toString("hex"))
      .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS)
      .sign(this.key);

    const response: Record<string, unknown> = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SECONDS,
      scope: normalizedScope
    };

    if (normalizedScope.split(" ").includes(OFFLINE_SCOPE)) {
      response.refresh_token = await new SignJWT({ kind: "refresh", scope: normalizedScope, client_id: clientId })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(this.origin)
        .setAudience(REFRESH_AUDIENCE)
        .setSubject("gbf-owner")
        .setIssuedAt()
        .setJti(Buffer.from(randomBytes(16)).toString("hex"))
        .setExpirationTime(REFRESH_TTL)
        .sign(this.key);
    }

    return response;
  }
}

function requestValue(request: Request, key: string): string {
  const body = request.body as Record<string, unknown> | undefined;
  const value = body?.[key];
  return typeof value === "string" ? value : "";
}

export function installOAuthRoutes(app: Application, service: GbfOAuthService) {
  const metadata = (_request: Request, response: Response) => {
    response.set("Cache-Control", "no-store");
    response.set("Access-Control-Allow-Origin", "*");
    response.json(service.protectedResourceMetadata());
  };
  app.get("/.well-known/oauth-protected-resource", metadata);
  app.get("/.well-known/oauth-protected-resource/mcp", metadata);

  app.get("/.well-known/oauth-authorization-server", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.set("Access-Control-Allow-Origin", "*");
    response.json(service.authorizationServerMetadata());
  });

  app.post("/oauth/register", async (request, response) => {
    try {
      response.set("Cache-Control", "no-store");
      response.status(201).json(await service.registerClient(request.body));
    } catch (error) {
      oauthError(response, 400, "invalid_client_metadata", error instanceof Error ? error.message : String(error));
    }
  });

  app.get("/oauth/authorize", async (request, response) => {
    try {
      const responseType = String(request.query.response_type ?? "");
      const clientId = String(request.query.client_id ?? "");
      const redirectUri = String(request.query.redirect_uri ?? "");
      const codeChallenge = String(request.query.code_challenge ?? "");
      const method = String(request.query.code_challenge_method ?? "");
      const scope = String(request.query.scope ?? READ_SCOPE);
      const resource = String(request.query.resource ?? service.resource);
      const state = String(request.query.state ?? "");
      if (responseType !== "code") throw new Error("response_type must be code");
      if (method !== "S256") throw new Error("code_challenge_method must be S256");
      const client = await service.verifyClient(clientId);
      if (!client.redirectUris.includes(redirectUri)) throw new Error("redirect_uri is not registered");
      normalizeScope(scope);
      if (resource !== service.resource) throw new Error("resource does not match GBF MCP endpoint");

      response.set("Cache-Control", "no-store");
      response.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize GitHub But Fast</title></head>
<body style="font-family:system-ui;max-width:680px;margin:48px auto;padding:0 20px;line-height:1.5">
<h1>Authorize GitHub But Fast</h1>
<p><strong>${htmlEscape(client.clientName ?? "MCP client")}</strong> is requesting read-only access to the repositories already allowlisted by GBF.</p>
<p>Enter your existing <code>MCP_BEARER_TOKEN</code> to approve this connection. The token is submitted only to your GBF server and is never sent to the MCP client.</p>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="client_id" value="${htmlEscape(clientId)}">
<input type="hidden" name="redirect_uri" value="${htmlEscape(redirectUri)}">
<input type="hidden" name="code_challenge" value="${htmlEscape(codeChallenge)}">
<input type="hidden" name="code_challenge_method" value="S256">
<input type="hidden" name="scope" value="${htmlEscape(scope)}">
<input type="hidden" name="resource" value="${htmlEscape(resource)}">
<input type="hidden" name="state" value="${htmlEscape(state)}">
<label>GBF owner token<br><input name="owner_secret" type="password" autocomplete="current-password" required style="width:100%;padding:10px;margin:8px 0 18px"></label>
<button type="submit" style="padding:10px 16px">Authorize read-only GBF</button>
</form></body></html>`);
    } catch (error) {
      oauthError(response, 400, "invalid_request", error instanceof Error ? error.message : String(error));
    }
  });

  app.post("/oauth/authorize", async (request, response) => {
    try {
      const clientId = requestValue(request, "client_id");
      const redirectUri = requestValue(request, "redirect_uri");
      const codeChallenge = requestValue(request, "code_challenge");
      const method = requestValue(request, "code_challenge_method");
      const scope = requestValue(request, "scope") || READ_SCOPE;
      const resource = requestValue(request, "resource") || service.resource;
      const state = requestValue(request, "state");
      const ownerSecret = requestValue(request, "owner_secret");
      if (method !== "S256") throw new Error("code_challenge_method must be S256");
      const client = await service.verifyClient(clientId);
      if (!client.redirectUris.includes(redirectUri)) throw new Error("redirect_uri is not registered");
      if (!service.ownerSecretMatches(ownerSecret)) {
        response.status(403).type("html").send("Authorization denied: owner token did not match.");
        return;
      }
      const code = service.issueAuthorizationCode({ clientId, redirectUri, codeChallenge, scope, resource });
      const destination = new URL(redirectUri);
      destination.searchParams.set("code", code);
      if (state) destination.searchParams.set("state", state);
      destination.searchParams.set("iss", service.origin);
      response.redirect(303, destination.toString());
    } catch (error) {
      oauthError(response, 400, "invalid_request", error instanceof Error ? error.message : String(error));
    }
  });

  app.post("/oauth/token", async (request, response) => {
    response.set("Cache-Control", "no-store");
    const grantType = requestValue(request, "grant_type");
    try {
      if (grantType === "authorization_code") {
        const tokens = await service.redeemAuthorizationCode({
          code: requestValue(request, "code"),
          clientId: requestValue(request, "client_id"),
          redirectUri: requestValue(request, "redirect_uri"),
          codeVerifier: requestValue(request, "code_verifier"),
          resource: requestValue(request, "resource") || undefined
        });
        response.json(tokens);
        return;
      }
      if (grantType === "refresh_token") {
        const tokens = await service.refresh({
          refreshToken: requestValue(request, "refresh_token"),
          clientId: requestValue(request, "client_id"),
          scope: requestValue(request, "scope") || undefined,
          resource: requestValue(request, "resource") || undefined
        });
        response.json(tokens);
        return;
      }
      oauthError(response, 400, "unsupported_grant_type", "only authorization_code and refresh_token are supported");
    } catch (error) {
      oauthError(response, 400, "invalid_grant", error instanceof Error ? error.message : String(error));
    }
  });
}
