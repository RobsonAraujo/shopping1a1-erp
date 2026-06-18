export const DEFAULT_PIS_RATE = 1.65;
export const DEFAULT_COFINS_RATE = 7.6;
export const DEFAULT_ORIGIN_UF = "SP";
export const DEFAULT_IRPJ_ADDITIONAL_THRESHOLD = 20_000;

export const SUDESTE_SUL_INTERESTADUAL_UFS = new Set([
  "RJ",
  "MG",
  "PR",
  "SC",
  "RS",
]);

export const IMPORT_CONTENT_THRESHOLD_PERCENT = 40;

export function getTaxReportBillingConcurrency(): number {
  const raw = Number(process.env.TAX_REPORT_BILLING_CONCURRENCY ?? "8");
  if (!Number.isFinite(raw) || raw < 1) return 8;
  return Math.min(20, Math.floor(raw));
}

export function getContributorCacheTtlMs(): number {
  const days = Number(process.env.TAXPAYER_CACHE_TTL_DAYS ?? "7");
  if (!Number.isFinite(days) || days < 1) return 7 * 24 * 60 * 60 * 1000;
  return days * 24 * 60 * 60 * 1000;
}

/** CNPJ.ws é paga e desligada por padrão — só ativa com opt-in explícito. */
export function isCnpjWsEnabled(): boolean {
  return (
    process.env.CONTRIBUTOR_PROVIDER?.toLowerCase() === "cnpj_ws" &&
    Boolean(process.env.CNPJ_WS_API_KEY?.trim())
  );
}

export function getContributorProvider(): "cnpj_ws" | "stub" {
  return isCnpjWsEnabled() ? "cnpj_ws" : "stub";
}

export function normalizeUf(uf: string | null | undefined): string | null {
  if (!uf) return null;
  const normalized = uf.trim().toUpperCase();
  return normalized.length === 2 ? normalized : null;
}
