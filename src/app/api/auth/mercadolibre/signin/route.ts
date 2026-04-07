import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/mercadolibre/oauth";
import {
  logServerError,
  oauthRedirectErrorParam,
} from "@/lib/server-public-error";
import { setOAuthStateCookie } from "@/lib/mercadolibre/session";

export async function GET(request: Request) {
  try {
    const state = randomBytes(24).toString("hex");
    const url = buildAuthorizationUrl(state);
    const res = NextResponse.redirect(url);
    setOAuthStateCookie(res.cookies, state);
    return res;
  } catch (e) {
    logServerError("mercadolibre/signin", e);
    const code = oauthRedirectErrorParam(e, "oauth_config");
    return NextResponse.redirect(
      new URL(`/?error=${code}`, request.url),
    );
  }
}
