import { skuImpostoOperacionalPercentual } from "@/lib/tax-report/imposto-operacional";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import { lastClosedMonth } from "@/lib/date-range";
import type { TaxReportPayload } from "@/lib/tax-report/types";

const RECENT_SNAPSHOTS_LIMIT = 12;

type SnapshotsLoader = (sellerId: number) => Promise<TaxReportPayload[]>;

function anchoredLoadSnapshots(anchor: { year: number; month: number }) {
  return async (sellerId: number) => {
    const { loadRecentTaxReportSummariesUpTo } = await import(
      "@/lib/tax-report/service/generate-monthly-report"
    );
    return loadRecentTaxReportSummariesUpTo(
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
  /** Lookup por identidade (mlItemId) — preferir este; sku-texto não é mais único, `bySku` é só fallback pra linha sem produto resolvido ou snapshot antigo sem mlItemId. */
  byMlItemId: Map<string, ProductTaxFromReport>;
  bySku: Map<string, ProductTaxFromReport>;
};

/**
 * Carrega os relatórios tributários mais recentes e monta um mapa
 * sku -> imposto operacional médio (%), para preencher a coluna "Imposto"
 * da tela de produtos (e demais telas que usam o mesmo custo/imposto).
 *
 * Sem `anchor` nem `loadSnapshots` explícito (uso "ao vivo" em
 * Produtos/Lucratividade), a busca é ancorada no **último mês fechado**
 * (`lastClosedMonth`) — nunca no mês em andamento, que só teria alguns dias
 * de amostra no início do período e produziria um % pouco representativo.
 * Isso dá sempre um número real de um mês inteiro (não uma aproximação):
 * mais preciso que uma média ponderada por dias, e igualmente barato (é a
 * mesma busca por um snapshot só, sem combinar nada).
 *
 * Se um SKU não aparecer nesse mês, cai para o snapshot mais recente dentre
 * os anteriores que contenha esse SKU — evita deixar produtos pouco
 * vendidos sem imposto só porque não venderam naquele mês.
 *
 * `anchor`, quando informado (ex.: pelo DRE, ao montar um mês fiscal
 * específico), ancora a busca nesse mês exato em vez do último fechado —
 * nunca usa a % de um relatório tributário gerado depois do período sendo
 * calculado. `loadSnapshots` explícito (testes) ignora tanto `anchor` quanto
 * o último mês fechado — usa exatamente os snapshots injetados.
 */
export async function loadProductTaxFromLatestReport(
  sellerId: number,
  loadSnapshots?: SnapshotsLoader,
  anchor?: { year: number; month: number },
): Promise<ProductTaxReportLookup> {
  const resolvedLoadSnapshots =
    loadSnapshots ?? anchoredLoadSnapshots(anchor ?? lastClosedMonth());
  const payloads = await resolvedLoadSnapshots(sellerId);
  if (payloads.length === 0) {
    return { generatedAt: null, byMlItemId: new Map(), bySku: new Map() };
  }

  const generatedAt = payloads[0].meta.geradoEm;
  const byMlItemId = new Map<string, ProductTaxFromReport>();
  const bySku = new Map<string, ProductTaxFromReport>();

  for (const payload of payloads) {
    for (const row of payload.porSku) {
      const entry: ProductTaxFromReport = {
        taxPercent: skuImpostoOperacionalPercentual(row),
        generatedAt: payload.meta.geradoEm,
        year: payload.year,
        month: payload.month,
      };
      if (row.mlItemId && !byMlItemId.has(row.mlItemId)) {
        byMlItemId.set(row.mlItemId, entry);
      }
      const skus = [row.sku, ...(row.skuAliases ?? [])];
      for (const sku of skus) {
        const key = normalizeProductSku(sku);
        if (!bySku.has(key)) {
          bySku.set(key, entry);
        }
      }
    }
  }

  return { generatedAt, byMlItemId, bySku };
}
