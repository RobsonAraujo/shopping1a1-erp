import { skuImpostoOperacionalPercentual } from "@/lib/tax-report/imposto-operacional";
import { normalizeProductSku } from "@/lib/product-pricing";
import type { TaxReportPayload } from "@/lib/tax-report/types";

const RECENT_SNAPSHOTS_LIMIT = 12;

type SnapshotsLoader = (sellerId: number) => Promise<TaxReportPayload[]>;

async function defaultLoadSnapshots(sellerId: number) {
  const { loadRecentTaxReportSnapshots } = await import(
    "@/lib/tax-report/service/generate-monthly-report"
  );
  return loadRecentTaxReportSnapshots(sellerId, RECENT_SNAPSHOTS_LIMIT);
}

function anchoredLoadSnapshots(anchor: { year: number; month: number }) {
  return async (sellerId: number) => {
    const { loadRecentTaxReportSnapshotsUpTo } = await import(
      "@/lib/tax-report/service/generate-monthly-report"
    );
    return loadRecentTaxReportSnapshotsUpTo(
      sellerId,
      anchor.year,
      anchor.month,
      RECENT_SNAPSHOTS_LIMIT,
    );
  };
}

export type ProductTaxFromReport = {
  /** % médio operacional de imposto apurado por venda, vindo do relatório tributário. */
  taxPercent: number;
  /** Data (ISO) em que o snapshot usado foi gerado/recalculado. */
  generatedAt: string;
  /** Mês/ano do relatório tributário de onde veio o valor (ex.: pode ser um mês anterior, por fallback). */
  year: number;
  month: number;
};

export type ProductTaxReportLookup = {
  generatedAt: string | null;
  bySku: Map<string, ProductTaxFromReport>;
};

/**
 * Carrega os relatórios tributários mais recentes e monta um mapa
 * sku -> imposto operacional médio (%), para preencher a coluna "Imposto"
 * da tela de produtos (e demais telas que usam o mesmo custo/imposto).
 *
 * Se um SKU não aparecer no snapshot mais recente, cai para o snapshot mais
 * recente dentre os anteriores que contenha esse SKU — evita deixar produtos
 * pouco vendidos sem imposto só porque não venderam no último mês apurado.
 *
 * `anchor`, quando informado (ex.: pelo DRE, ao montar um mês específico),
 * ancora a busca de "mais recente" nesse mês — nunca usa a % de um relatório
 * tributário gerado depois do período sendo calculado. Sem `anchor` (uso em
 * telas "ao vivo" como Produtos/Lucratividade), a busca continua ancorada em
 * agora. Ignorado quando `loadSnapshots` é passado explicitamente (testes).
 */
export async function loadProductTaxFromLatestReport(
  sellerId: number,
  loadSnapshots?: SnapshotsLoader,
  anchor?: { year: number; month: number },
): Promise<ProductTaxReportLookup> {
  const resolvedLoadSnapshots =
    loadSnapshots ??
    (anchor ? anchoredLoadSnapshots(anchor) : defaultLoadSnapshots);
  const payloads = await resolvedLoadSnapshots(sellerId);
  if (payloads.length === 0) {
    return { generatedAt: null, bySku: new Map() };
  }

  const generatedAt = payloads[0].meta.geradoEm;
  const bySku = new Map<string, ProductTaxFromReport>();

  for (const payload of payloads) {
    for (const row of payload.porSku) {
      const entry: ProductTaxFromReport = {
        taxPercent: skuImpostoOperacionalPercentual(row),
        generatedAt: payload.meta.geradoEm,
        year: payload.year,
        month: payload.month,
      };
      const skus = [row.sku, ...(row.skuAliases ?? [])];
      for (const sku of skus) {
        const key = normalizeProductSku(sku);
        if (!bySku.has(key)) {
          bySku.set(key, entry);
        }
      }
    }
  }

  return { generatedAt, bySku };
}
