/**
 * URL pública de produção — Vercel injeta `VERCEL_PROJECT_PRODUCTION_URL`
 * automaticamente com o domínio de produção (sem depender de preview/branch).
 * Usado por `metadataBase`, `sitemap.ts` e `robots.ts` — um lugar só, em vez
 * de hardcodar o domínio ou reimplementar o fallback em cada arquivo.
 */
export function siteUrl(): string {
  return process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";
}
