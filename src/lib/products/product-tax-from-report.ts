import { skuImpostoOperacionalPercentual } from "@/lib/tax-report/imposto-operacional";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import { roundMoney } from "@/lib/pricing/financial-margin";
import { zonedYmd } from "@/lib/report-timezone";
import type { SkuAggregation } from "@/lib/tax-report/types";
import type {
  TaxFallbackRow,
  TaxSnapshotMeta,
  TaxWindowRow,
} from "@/lib/tax-report/service/tax-daily-totals-data";

/** Dias corridos da janela do imposto "ao vivo". */
export const TAX_WINDOW_DAYS = 30;

export type ProductTaxBasis = "rolling30d" | "month";

export type ProductTaxFromReport = {
  /** % operacional de imposto (imposto ÷ receita das vendas), vindo do relatório tributário. */
  taxPercent: number;
  /** `rolling30d` = vendas da janela de 30 dias; `month` = % do mês mais recente em que o anúncio vendeu (fallback). */
  basis: ProductTaxBasis;
  /** Data (ISO) em que o snapshot usado foi gerado/recalculado (na janela: o mais recente dela). */
  generatedAt: string;
  /** Mês/ano do relatório de onde veio o valor (na janela: o mês mais recente dela). */
  year: number;
  month: number;
  /** Só em `rolling30d`: dias (`YYYY-MM-DD`) das vendas somadas. */
  periodFrom?: string;
  periodTo?: string;
};

export type ProductTaxReportLookup = {
  generatedAt: string | null;
  /** Janela de 30 dias usada (null = nenhum snapshot com totais diários ainda). */
  window: { from: string; to: string } | null;
  /** Lookup por identidade (mlItemId) — preferir este; sku-texto não é mais único, `bySku` é só fallback pra linha sem produto resolvido ou snapshot antigo sem mlItemId. */
  byMlItemId: Map<string, ProductTaxFromReport>;
  bySku: Map<string, ProductTaxFromReport>;
};

export function emptyProductTaxLookup(): ProductTaxReportLookup {
  return { generatedAt: null, window: null, byMlItemId: new Map(), bySku: new Map() };
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function monthEndYmd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * Janela de 30 dias terminando no último dia com dado no Tributário: o dia em
 * que os pedidos do snapshot mais recente foram buscados — limitado ao fim do
 * mês dele e a hoje. Assim são sempre 30 dias de vendas reais, mesmo com o
 * Tributário do mês corrente parado ou ainda não gerado.
 */
export function resolveTaxWindow(
  latest: Pick<TaxSnapshotMeta, "year" | "month" | "ordersFetchedAt">,
  now: Date = new Date(),
): { from: string; to: string } {
  const fetchedAt = new Date(latest.ordersFetchedAt);
  const candidates = [monthEndYmd(latest.year, latest.month), zonedYmd(now)];
  if (!Number.isNaN(fetchedAt.getTime())) candidates.push(zonedYmd(fetchedAt));
  const to = candidates.sort()[0];
  return { from: addDaysYmd(to, -(TAX_WINDOW_DAYS - 1)), to };
}

function fallbackPercent(row: TaxFallbackRow): number {
  return skuImpostoOperacionalPercentual({
    impostoOperacionalMedioPercentual:
      row.impostoOperacionalMedioPercentual ?? undefined,
    impostoOperacionalTotal: row.impostoOperacionalTotal ?? undefined,
    receitaTotal: row.receitaTotal,
    transacoes: [],
  } as Partial<SkuAggregation> as SkuAggregation);
}

/**
 * Monta o lookup por anúncio: o % das vendas da janela (Σ imposto ÷ Σ
 * receita) quando o anúncio vendeu nela; senão o % do mês mais recente em que
 * ele aparece (`fallbackRows`, mais recente primeiro) — evita deixar produto
 * pouco vendido sem imposto só porque não vendeu nos últimos 30 dias.
 */
export function buildRollingTaxLookup(input: {
  window: { from: string; to: string } | null;
  windowSnapshot: Pick<TaxSnapshotMeta, "year" | "month" | "generatedAt"> | null;
  windowRows: TaxWindowRow[];
  fallbackRows: TaxFallbackRow[];
  generatedAt: string | null;
}): ProductTaxReportLookup {
  const byMlItemId = new Map<string, ProductTaxFromReport>();
  const bySku = new Map<string, ProductTaxFromReport>();
  const setSku = (sku: string, entry: ProductTaxFromReport) => {
    const key = normalizeProductSku(sku);
    if (!bySku.has(key)) bySku.set(key, entry);
  };

  const { window, windowSnapshot } = input;
  if (window && windowSnapshot) {
    for (const row of input.windowRows) {
      if (!(row.receita > 0)) continue;
      const entry: ProductTaxFromReport = {
        taxPercent: roundMoney((row.imposto / row.receita) * 100),
        basis: "rolling30d",
        generatedAt: windowSnapshot.generatedAt,
        year: windowSnapshot.year,
        month: windowSnapshot.month,
        periodFrom: window.from,
        periodTo: window.to,
      };
      if (row.mlItemId) byMlItemId.set(row.mlItemId, entry);
      for (const sku of row.skus) setSku(sku, entry);
    }
  }

  for (const row of input.fallbackRows) {
    const own: ProductTaxFromReport = {
      taxPercent: fallbackPercent(row),
      basis: "month",
      generatedAt: row.generatedAt,
      year: row.year,
      month: row.month,
    };
    // SKU/alias antigo de um anúncio que vendeu na janela aponta pro % da janela.
    const entry = (row.mlItemId && byMlItemId.get(row.mlItemId)) || own;
    if (row.mlItemId && !byMlItemId.has(row.mlItemId)) {
      byMlItemId.set(row.mlItemId, entry);
    }
    for (const sku of [row.sku, ...(row.skuAliases ?? [])]) setSku(sku, entry);
  }

  return { generatedAt: input.generatedAt, window, byMlItemId, bySku };
}

/**
 * Imposto "ao vivo" por anúncio (Produtos, Lucratividade, detalhe do
 * anúncio): % das vendas dos últimos 30 dias apuradas no Tributário, somadas
 * no Postgres a partir de `TaxReportMonthSnapshot.dailyTotals` — trafega só
 * um número por anúncio. Anúncio sem venda na janela cai no % do mês mais
 * recente em que aparece. O DRE não usa isto: um mês do DRE usa o % do
 * próprio mês (`loadDreTaxRates`).
 */
export async function loadProductTaxRolling30d(
  organizationId: string,
  sellerId: number,
  now: Date = new Date(),
): Promise<ProductTaxReportLookup> {
  const { loadTaxFallbackRows, loadTaxSnapshotMetas, loadTaxWindowTotals } =
    await import("@/lib/tax-report/service/tax-daily-totals-data");
  // A janela depende do snapshot mais recente: sai assim que os metadados
  // chegam, em paralelo com o fallback.
  const windowPromise = loadTaxSnapshotMetas(organizationId, sellerId).then(
    async (metas) => {
      const windowSnapshot = metas.find((meta) => meta.hasDailyTotals) ?? null;
      const window = windowSnapshot ? resolveTaxWindow(windowSnapshot, now) : null;
      const windowRows = window
        ? await loadTaxWindowTotals(organizationId, sellerId, window)
        : [];
      return { metas, windowSnapshot, window, windowRows };
    },
  );
  const [{ metas, windowSnapshot, window, windowRows }, fallbackSummaryRows] =
    await Promise.all([
      windowPromise,
      loadTaxFallbackRows(organizationId, sellerId),
    ]);
  if (metas.length === 0) return emptyProductTaxLookup();

  const generatedAtByMonth = new Map(
    metas.map((meta) => [`${meta.year}-${meta.month}`, meta.generatedAt]),
  );
  const fallbackRows = fallbackSummaryRows.map((row) => ({
    ...row,
    generatedAt:
      generatedAtByMonth.get(`${row.year}-${row.month}`) ?? metas[0].generatedAt,
  }));

  return buildRollingTaxLookup({
    window,
    windowSnapshot,
    windowRows,
    fallbackRows,
    generatedAt: metas[0].generatedAt,
  });
}
