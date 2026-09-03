import * as Sentry from "@sentry/nextjs";

/**
 * Único ponto de integração com o provedor de error tracking (hoje: Bugsink,
 * compatível com o SDK do Sentry, via `NEXT_PUBLIC_BUGSINK_DSN`). Trocar de
 * provedor no futuro deve significar mexer só neste arquivo — o resto do app
 * (instrumentation client/server, `logServerError`, `logClientError`) só
 * conhece as funções abaixo, nunca `@sentry/nextjs` diretamente.
 */
const dsn = process.env.NEXT_PUBLIC_BUGSINK_DSN;
const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV;

export function initErrorTrackingClient(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    // Bugsink é só error tracking — sem tracing/performance.
    tracesSampleRate: 0,
  });
}

export function initErrorTrackingServer(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0,
  });
}

/** Usado por `logServerError`/`logClientError` — mantém os call sites já existentes no app. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Repassado como `onRequestError` em `src/instrumentation.ts`. */
export function captureRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  if (!dsn) return;
  Sentry.captureRequestError(error, request, context);
}
