import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/mercadolibre/oauth";
import { fetchMe } from "@/lib/mercadolibre/api";
import {
  logServerError,
  oauthRedirectErrorParam,
} from "@/lib/infra/server-public-error";
import {
  upsertSellerCredentials,
  type PersistSellerCredentialsFailure,
} from "@/lib/mercadolibre/persist-seller-tokens";
import {
  clearOAuthStateCookie,
  mergeTokensWithExistingRefresh,
  readOAuthState,
  setSessionCookies,
} from "@/lib/mercadolibre/session";
import { ensureOrganizationForMlSeller } from "@/lib/organizations/ensure-organization";

/**
 * Sem credencial gravada o vendedor até navega (os cookies de sessão bastam pro
 * browser), mas cron de catálogo e snapshot de inventário não conseguem token e
 * falham só pra ele — conta meio quebrada, difícil de diagnosticar depois.
 * Melhor recusar o login com um código próprio.
 *
 * Única exceção: fora de produção o ambiente roda sem `ENCRYPTION_KEY`.
 */
function credentialFailureBlocksLogin(
  reason: PersistSellerCredentialsFailure,
): boolean {
  if (reason === "encryption_key_missing") {
    return process.env.NODE_ENV === "production";
  }
  return true;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent(oauthError)}`,
        request.url,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/?error=missing_code_or_state", request.url),
    );
  }

  const cookieStore = await cookies();
  const expected = readOAuthState(cookieStore);
  if (!expected || expected !== state) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const tokensForSession = mergeTokensWithExistingRefresh(tokens, cookieStore);
    const me = await fetchMe(tokensForSession.access_token);

    const persisted = await upsertSellerCredentials(me.id, tokensForSession);
    if (!persisted.ok && credentialFailureBlocksLogin(persisted.reason)) {
      const failed = NextResponse.redirect(
        new URL(`/?error=credentials_not_persisted`, request.url),
      );
      clearOAuthStateCookie(failed.cookies);
      return failed;
    }

    await ensureOrganizationForMlSeller(me.id, {
      email: me.email,
      nickname: me.nickname,
    });

    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    clearOAuthStateCookie(res.cookies);
    setSessionCookies(res.cookies, tokensForSession, me.id);
    return res;
  } catch (e) {
    logServerError("mercadolibre/callback", e);
    const code = oauthRedirectErrorParam(e, "oauth_failed");
    return NextResponse.redirect(
      new URL(`/?error=${code}`, request.url),
    );
  }
}
