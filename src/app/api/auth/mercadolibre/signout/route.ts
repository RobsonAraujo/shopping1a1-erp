import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/mercadolibre/session";

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/", request.url));
  clearSessionCookies(res.cookies);
  return res;
}
