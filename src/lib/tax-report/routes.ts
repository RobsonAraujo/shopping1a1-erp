import { normalizeProductSku } from "@/lib/product-pricing";

export const TAX_REPORT_MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function taxReportPath(): string {
  return "/dashboard/relatorio-tributario";
}

export function taxReportSkuPath(
  year: number,
  month: number,
  sku: string,
): string {
  return `/dashboard/relatorio-tributario/${year}/${month}/sku/${encodeURIComponent(sku)}`;
}

export function parseTaxReportSkuParams(params: {
  year: string;
  month: string;
  sku: string;
}): { year: number; month: number; sku: string } | null {
  const year = Number(params.year);
  const month = Number(params.month);
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  let sku: string;
  try {
    sku = decodeURIComponent(params.sku);
  } catch {
    return null;
  }

  const normalized = normalizeProductSku(sku);
  if (!normalized) return null;
  return { year, month, sku: normalized };
}
