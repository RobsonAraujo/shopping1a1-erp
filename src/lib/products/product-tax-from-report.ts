import { skuImpostoOperacionalPercentual } from "@/lib/tax-report/imposto-operacional";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import { lastDaysMonthWeights } from "@/lib/date-range";
import type { TaxReportPayload } from "@/lib/tax-report/types";

const RECENT_SNAPSHOTS_LIMIT = 12;
const ROLLING_WINDOW_DAYS = 30;

type SnapshotsLoader = (sellerId: number) => Promise<TaxReportPayload[]>;

async function defaultLoadSnapshots(sellerId: number) {
  const { loadRecentTaxReportSummaries } = await import(
    "@/lib/tax-report/service/generate-monthly-report"
  );
  return loadRecentTaxReportSummaries(sellerId, RECENT_SNAPSHOTS_LIMIT);
}

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

/** Coleta, por identidade (mlItemId/sku), todas as ocorrências de um SKU nos
 * snapshots carregados — mais recente primeiro (mesma ordem dos `payloads`
 * de entrada). Extraído do laço principal para ser reaproveitado tanto pelo
 * caminho "primeiro que aparece vence" (com anchor/loadSnapshots explícito)
 * quanto pelo blend da janela de 30 dias. */
function collectEntriesByIdentity(payloads: TaxReportPayload[]): {
  byMlItemId: Map<string, ProductTaxFromReport[]>;
  bySku: Map<string, ProductTaxFromReport[]>;
} {
  const byMlItemId = new Map<string, ProductTaxFromReport[]>();
  const bySku = new Map<string, ProductTaxFromReport[]>();

  for (const payload of payloads) {
    for (const row of payload.porSku) {
      const entry: ProductTaxFromReport = {
        taxPercent: skuImpostoOperacionalPercentual(row),
        generatedAt: payload.meta.geradoEm,
        year: payload.year,
        month: payload.month,
      };
      if (row.mlItemId) {
        const list = byMlItemId.get(row.mlItemId) ?? [];
        list.push(entry);
        byMlItemId.set(row.mlItemId, list);
      }
      const skus = [row.sku, ...(row.skuAliases ?? [])];
      for (const sku of skus) {
        const key = normalizeProductSku(sku);
        const list = bySku.get(key) ?? [];
        list.push(entry);
        bySku.set(key, list);
      }
    }
  }

  return { byMlItemId, bySku };
}

/**
 * Combina até 2 meses (o mais recente e o anterior, na ordem em que aparecem
 * em `entriesDesc`) numa média ponderada pelos dias que cada um ocupa dentro
 * da janela móvel de 30 dias — sem reagregar por transação, só pondera os %
 * mensais já calculados (mesmo dado leve de sempre). Um slot da janela sem
 * snapshot disponível (nem um mais antigo) simplesmente não entra na conta;
 * o peso é renormalizado entre os slots que encontraram dado — histórico
 * insuficiente (ex.: conta nova com 1 mês só) colapsa pra 100% dele, igual
 * ao comportamento anterior ao SKU não aparecer no mês mais recente.
 */
export function blendByMonthWeights(
  entriesDesc: ProductTaxFromReport[],
  monthWeights: { year: number; month: number; weightDays: number }[],
): ProductTaxFromReport | undefined {
  if (entriesDesc.length === 0) return undefined;

  let cursor = 0;
  let weightedSum = 0;
  let weightTotal = 0;
  let mostRecentUsed: ProductTaxFromReport | undefined;

  for (const slot of monthWeights) {
    const idx = entriesDesc.findIndex(
      (entry, i) =>
        i >= cursor &&
        (entry.year < slot.year ||
          (entry.year === slot.year && entry.month <= slot.month)),
    );
    if (idx === -1) continue;
    const entry = entriesDesc[idx];
    cursor = idx + 1;
    weightedSum += entry.taxPercent * slot.weightDays;
    weightTotal += slot.weightDays;
    mostRecentUsed ??= entry;
  }

  if (!mostRecentUsed) return entriesDesc[0];

  return {
    taxPercent: weightedSum / weightTotal,
    generatedAt: mostRecentUsed.generatedAt,
    year: mostRecentUsed.year,
    month: mostRecentUsed.month,
  };
}

/**
 * Carrega os relatórios tributários mais recentes e monta um mapa
 * sku -> imposto operacional médio (%), para preencher a coluna "Imposto"
 * da tela de produtos (e demais telas que usam o mesmo custo/imposto).
 *
 * Sem `anchor` nem `loadSnapshots` explícito (uso "ao vivo" em
 * Produtos/Lucratividade), o % passa a representar uma janela móvel dos
 * últimos 30 dias corridos terminando hoje — combinando o(s) mês(es)
 * tocados por essa janela, ponderados pelos dias que cada um ocupa nela
 * (`lastDaysMonthWeights`). Isso evita que o início de um mês (poucos dias
 * de amostra) produza um % pouco representativo.
 *
 * Se um SKU não aparecer em nenhum snapshot dentro da janela, cai para o
 * snapshot mais recente dentre os anteriores que contenha esse SKU — evita
 * deixar produtos pouco vendidos sem imposto só porque não venderam
 * recentemente.
 *
 * `anchor`, quando informado (ex.: pelo DRE, ao montar um mês fiscal
 * específico e fechado), ancora a busca no mês exato — nunca usa a % de um
 * relatório tributário gerado depois do período sendo calculado, e não
 * aplica a janela de 30 dias (misturaria dois meses contábeis diferentes
 * numa demonstração de um mês só). Mesma exceção para `loadSnapshots`
 * passado explicitamente (testes): usa o "primeiro que aparece vence" sem
 * blend, pelo mesmo motivo que já ignorava `anchor` nesse caso.
 */
export async function loadProductTaxFromLatestReport(
  sellerId: number,
  loadSnapshots?: SnapshotsLoader,
  anchor?: { year: number; month: number },
): Promise<ProductTaxReportLookup> {
  const useRollingWindow = !loadSnapshots && !anchor;
  const resolvedLoadSnapshots =
    loadSnapshots ??
    (anchor ? anchoredLoadSnapshots(anchor) : defaultLoadSnapshots);
  const payloads = await resolvedLoadSnapshots(sellerId);
  if (payloads.length === 0) {
    return { generatedAt: null, byMlItemId: new Map(), bySku: new Map() };
  }

  const generatedAt = payloads[0].meta.geradoEm;
  const { byMlItemId: byMlItemIdEntries, bySku: bySkuEntries } =
    collectEntriesByIdentity(payloads);

  const byMlItemId = new Map<string, ProductTaxFromReport>();
  const bySku = new Map<string, ProductTaxFromReport>();
  const monthWeights = useRollingWindow
    ? lastDaysMonthWeights(ROLLING_WINDOW_DAYS)
    : null;

  const resolveEntry = (entries: ProductTaxFromReport[]) =>
    monthWeights ? blendByMonthWeights(entries, monthWeights) : entries[0];

  for (const [key, entries] of byMlItemIdEntries) {
    const resolved = resolveEntry(entries);
    if (resolved) byMlItemId.set(key, resolved);
  }
  for (const [key, entries] of bySkuEntries) {
    const resolved = resolveEntry(entries);
    if (resolved) bySku.set(key, resolved);
  }

  return { generatedAt, byMlItemId, bySku };
}
