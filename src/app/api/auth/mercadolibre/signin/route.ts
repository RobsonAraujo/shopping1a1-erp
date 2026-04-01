import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/mercadolibre/oauth";
import { setOAuthStateCookie } from "@/lib/mercadolibre/session";

export async function GET(request: Request) {
  try {
    const state = randomBytes(24).toString("hex");
    const url = buildAuthorizationUrl(state);
    const res = NextResponse.redirect(url);
    setOAuthStateCookie(res.cookies, state);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "config_error";
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(msg)}`, request.url),
    );
  }
}
