import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/mercadolibre/oauth";
import { fetchMe } from "@/lib/mercadolibre/api";
import {
  logServerError,
  oauthRedirectErrorParam,
} from "@/lib/server-public-error";
import { upsertSellerCredentials } from "@/lib/mercadolibre/persist-seller-tokens";
import {
  clearOAuthStateCookie,
  readOAuthState,
  setSessionCookies,
} from "@/lib/mercadolibre/session";

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
    const me = await fetchMe(tokens.access_token);

    await upsertSellerCredentials(me.id, tokens);

    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    clearOAuthStateCookie(res.cookies);
    setSessionCookies(res.cookies, tokens, me.id);
    return res;
  } catch (e) {
    logServerError("mercadolibre/callback", e);
    const code = oauthRedirectErrorParam(e, "oauth_failed");
    return NextResponse.redirect(
      new URL(`/?error=${code}`, request.url),
    );
  }
}
