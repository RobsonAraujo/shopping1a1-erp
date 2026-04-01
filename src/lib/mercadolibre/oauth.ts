import { getMercadoLibreConfig, requireMercadoLibreOAuthConfig } from "./config";
import type { TokenResponse } from "./types";

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

  return res.json() as Promise<TokenResponse>;
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

  return res.json() as Promise<TokenResponse>;
}

export function buildAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = requireMercadoLibreOAuthConfig();
  const { authBase } = getMercadoLibreConfig();

  const u = new URL(`${authBase}/authorization`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}
