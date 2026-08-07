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

export function getTaxReportBillingConcurrency(): number {
  const raw = Number(process.env.TAX_REPORT_BILLING_CONCURRENCY ?? "8");
  if (!Number.isFinite(raw) || raw < 1) return 8;
  return Math.min(20, Math.floor(raw));
}

export { normalizeUf } from "@/lib/tax-report/brazilian-ufs";
