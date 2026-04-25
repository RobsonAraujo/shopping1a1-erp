import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookies,
  getValidAccessToken,
} from "@/lib/mercadolibre/session";

function safeNextPath(request: NextRequest): string {
  const next = request.nextUrl.searchParams.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: NextRequest) {
  const nextPath = safeNextPath(request);
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);

  if (!token) {
    const res = NextResponse.redirect(new URL("/", request.url));
    clearSessionCookies(res.cookies);
    return res;
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
