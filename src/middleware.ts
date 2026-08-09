import { NextResponse, type NextRequest } from "next/server";

/**
 * Duplica só o essencial de `@/lib/mercadolibre/session` (nomes de cookie +
 * regra de `needsRefresh`) em vez de importar o módulo — `session.ts` puxa
 * `db.ts` (Prisma) e `app-secret-crypto.ts` (`node:crypto`) via
 * `getValidAccessToken`, nenhum dos dois compatível com o Edge Runtime onde
 * o middleware roda.
 */
const ML_COOKIE = {
  access: "ml_access_token",
  refresh: "ml_refresh_token",
  expiresAt: "ml_expires_at",
} as const;

function refreshSessionPath(nextPath: string): string {
  const next = nextPath.startsWith("/") ? nextPath : "/dashboard";
  return `/api/auth/mercadolibre/refresh?next=${encodeURIComponent(next)}`;
}

export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ML_COOKIE.access)?.value;
  const refreshToken = request.cookies.get(ML_COOKIE.refresh)?.value;
  const expiresAtRaw = request.cookies.get(ML_COOKIE.expiresAt)?.value;
  const expiresAtMs = expiresAtRaw ? parseInt(expiresAtRaw, 10) : undefined;

  const isLoggedIn = Boolean(accessToken || refreshToken);
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const needsRefresh = Boolean(
    refreshToken &&
      (!accessToken ||
        (expiresAtMs !== undefined && expiresAtMs - Date.now() < 60_000)),
  );
  if (needsRefresh) {
    const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(refreshSessionPath(target), request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
