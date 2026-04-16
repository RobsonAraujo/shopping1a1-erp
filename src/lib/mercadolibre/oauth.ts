import { getMercadoLibreConfig, requireMercadoLibreOAuthConfig } from "./config";
import type { TokenResponse } from "./types";

function normalizeTokenResponse(raw: unknown): TokenResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid token response body");
  }
  const o = raw as Record<string, unknown>;
  const access =
    (typeof o.access_token === "string" && o.access_token) ||
    (typeof o.accessToken === "string" && o.accessToken);
  if (!access) {
    throw new Error("Token response missing access_token");
  }
  const refreshRaw =
    typeof o.refresh_token === "string"
      ? o.refresh_token
      : typeof o.refreshToken === "string"
        ? o.refreshToken
        : undefined;
  const refresh =
    refreshRaw && refreshRaw.trim().length > 0 ? refreshRaw.trim() : undefined;
  const expires =
    typeof o.expires_in === "number"
      ? o.expires_in
      : typeof o.expiresIn === "number"
        ? o.expiresIn
        : 3600;
  const token_type =
    typeof o.token_type === "string"
      ? o.token_type
      : typeof o.tokenType === "string"
        ? o.tokenType
        : "bearer";
  const scope = typeof o.scope === "string" ? o.scope : undefined;
  const user_id =
    typeof o.user_id === "number"
      ? o.user_id
      : typeof o.userId === "number"
        ? o.userId
        : undefined;
  return {
    access_token: access,
    token_type,
    expires_in: expires,
    refresh_token: refresh,
    scope,
    user_id,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireMercadoLibreOAuthConfig();
  const { apiBase } = getMercadoLibreConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${apiBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return normalizeTokenResponse(await res.json());
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireMercadoLibreOAuthConfig();
  const { apiBase } = getMercadoLibreConfig();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${apiBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  return normalizeTokenResponse(await res.json());
}

export function buildAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = requireMercadoLibreOAuthConfig();
  const { authBase } = getMercadoLibreConfig();

  const u = new URL(`${authBase}/authorization`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  // Required for refresh_token on token exchange (ML docs: scope offline_access read write).
  u.searchParams.set("scope", "offline_access read write");
  return u.toString();
}
