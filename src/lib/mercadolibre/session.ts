import { upsertSellerCredentials } from "./persist-seller-tokens";
import { refreshAccessToken } from "./oauth";
import type { TokenResponse } from "./types";

export const ML_COOKIE = {
  access: "ml_access_token",
  refresh: "ml_refresh_token",
  expiresAt: "ml_expires_at",
  userId: "ml_user_id",
  oauthState: "ml_oauth_state",
} as const;

const isProd = process.env.NODE_ENV === "production";

export type MlCookieStore = {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      path?: string;
      maxAge?: number;
    },
  ): void;
  delete(name: string): void;
};

function baseCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setOAuthStateCookie(store: MlCookieStore, state: string) {
  store.set(ML_COOKIE.oauthState, state, baseCookieOptions(600));
}

export function clearOAuthStateCookie(store: MlCookieStore) {
  store.delete(ML_COOKIE.oauthState);
}

export function readOAuthState(store: MlCookieStore): string | undefined {
  return store.get(ML_COOKIE.oauthState)?.value;
}

export function readSession(store: MlCookieStore) {
  const access = store.get(ML_COOKIE.access)?.value;
  const refresh = store.get(ML_COOKIE.refresh)?.value;
  const expiresAt = store.get(ML_COOKIE.expiresAt)?.value;
  const userId = store.get(ML_COOKIE.userId)?.value;
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAtMs: expiresAt ? parseInt(expiresAt, 10) : undefined,
    userId: userId ? parseInt(userId, 10) : undefined,
  };
}

/**
 * ML often omits `refresh_token` on later OAuth exchanges. Reuse the refresh token
 * from the existing session cookie so DB upsert and cookies stay consistent.
 */
export function mergeTokensWithExistingRefresh(
  tokens: TokenResponse,
  store: MlCookieStore,
): TokenResponse {
  const prior = readSession(store);
  const refresh = tokens.refresh_token ?? prior.refreshToken;
  if (!refresh) {
    return tokens;
  }
  return { ...tokens, refresh_token: refresh };
}

export function setSessionCookies(
  store: MlCookieStore,
  tokens: TokenResponse,
  userId: number,
) {
  const bufferSec = 120;
  const accessMaxAge = Math.max(60, (tokens.expires_in ?? 3600) - bufferSec);
  const expiresAtMs = Date.now() + (tokens.expires_in ?? 3600) * 1000;

  store.set(ML_COOKIE.access, tokens.access_token, baseCookieOptions(accessMaxAge));

  if (tokens.refresh_token) {
    store.set(
      ML_COOKIE.refresh,
      tokens.refresh_token,
      baseCookieOptions(60 * 60 * 24 * 180),
    );
  }

  store.set(
    ML_COOKIE.expiresAt,
    String(expiresAtMs),
    baseCookieOptions(accessMaxAge),
  );
  store.set(ML_COOKIE.userId, String(userId), baseCookieOptions(accessMaxAge));
}

export function clearSessionCookies(store: MlCookieStore) {
  store.delete(ML_COOKIE.access);
  store.delete(ML_COOKIE.refresh);
  store.delete(ML_COOKIE.expiresAt);
  store.delete(ML_COOKIE.userId);
}

/** Returns a valid access token or null if logged out / refresh failed. */
export async function getValidAccessToken(
  cookieStore: MlCookieStore,
): Promise<string | null> {
  const session = readSession(cookieStore);
  const now = Date.now();
  const needsRefresh =
    !session.accessToken ||
    (session.expiresAtMs !== undefined &&
      session.expiresAtMs - now < 60_000);

  if (!needsRefresh && session.accessToken) {
    return session.accessToken;
  }

  if (!session.refreshToken) {
    return session.accessToken ?? null;
  }

  try {
    const tokens = await refreshAccessToken(session.refreshToken);
    const uid = session.userId ?? tokens.user_id;
    if (!uid) {
      clearSessionCookies(cookieStore);
      return null;
    }
    setSessionCookies(cookieStore, tokens, uid);
    await upsertSellerCredentials(uid, tokens);
    return tokens.access_token;
  } catch {
    clearSessionCookies(cookieStore);
    return null;
  }
}
