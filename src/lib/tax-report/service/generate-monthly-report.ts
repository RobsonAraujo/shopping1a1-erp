import { prisma } from "@/lib/db";
import { fetchItemsByIdsBatched, fetchPaidOrdersByPeriod } from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import {
  fetchPadsAdvertiserId,
  fetchProductAdsMetricsByItem,
  getProductAdsDateRangeForMonth,
  isProductAdsMetricsRangeAvailable,
  type ItemAdMetrics,
} from "@/lib/mercadolibre/product-ads-metrics";
import { getCalendarMonthRange } from "@/lib/mercadolibre/revenue-periods";
import { getTaxReportBillingConcurrency } from "@/lib/tax-report/config";
import { buildTransacoesFromOrder } from "@/lib/tax-report/enrichment/build-transacao-venda";
import { resolveFixedCostCreditForMonth } from "@/lib/tax-report/fixed-cost-credit";
import {
  loadTaxFixedCostExcludedMonths,
  loadTaxFixedCostExplicitValues,
  loadTaxFixedCostItems,
} from "@/lib/tax-report/tax-fixed-cost-data";
import {
  loadCustoBySkuMap,
  type CustoProduto,
} from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import {
  fetchOrderBillingInfo,
  mapWithConcurrency,
  parseTaxpayerTypeFromMl,
} from "@/lib/tax-report/ml/billing-info-client";
import { fetchShipmentCost } from "@/lib/tax-report/ml/shipment-cost-client";
import {
  itemIdFromOrderLine,
  skuFromOrderLineWithFallback,
} from "@/lib/tax-report/ml/sku-from-order-line";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { resolveEffectiveSkuByItemId } from "@/lib/product-resolver";
import { repairTaxReportPayload } from "@/lib/tax-report/repair-snapshot-apuracao";
import { stripTransacoesForResponse } from "@/lib/tax-report/strip-transacoes-for-response";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import {
  loadCbsIbsVigencia,
  loadIcmsRatesMap,
  loadTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";
import type {
  ManualFiscalOverride,
  TaxCompanyConfig,
  TaxReportPayload,
} from "@/lib/tax-report/types";

export type GenerateMonthlyReportProgress = {
  phase: "orders" | "billing" | "compute" | "save" | "done";
  message: string;
  current?: number;
  total?: number;
};

function collectSkusFromOrders(
  orders: OrderSearchOrder[],
  itemById: Map<string, ItemBody>,
): string[] {
  const skus = new Set<string>();
  for (const order of orders) {
    for (const line of order.order_items ?? []) {
      const sku = skuFromOrderLineWithFallback(line, itemById);
      if (sku) skus.add(sku);
    }
  }
  return [...skus];
}

import { slimTaxReportPayloadForStorage } from "@/lib/tax-report/service/snapshot-storage";

export type GenerationOverrides = {
  /**
   * Uso interno exclusivo do simulador Simples x Lucro Real — nunca deve vir
   * de um body de request. Força o regime usado no cálculo sem alterar
   * `CompanyTaxSettings` no banco.
   */
  forceRegime?: "LUCRO_REAL";
  /**
   * Idem — empresa que sempre foi Simples nunca passou pela tela de
   * Configurações tributárias (só visível/aplicável em Lucro Real), então o
   * campo no banco é o default de fábrica, nunca calibrado por ela. A
   * simulação força `false` (sem crédito de ICMS-ST recuperável, Tema
   * 201/STF) pra não superestimar a vantagem do Lucro Real com uma tese que
   * a empresa nunca levantou/aplicou.
   */
  forceConsiderIcmsStRecuperavel?: boolean;
  /**
   * Idem — mesmo motivo do campo acima. Diferente do ICMS-ST recuperável
   * (tese discutível), a exclusão do ICMS da base do PIS/COFINS é
   * jurisprudência já pacificada (RE 574.706/STF, "tese do século") — a
   * simulação força `true` pra não depender do que porventura esteja
   * configurado no banco de uma empresa que nunca precisou mexer nisso.
   */
  forceExcludeIcmsFromPisCofinsBase?: boolean;
};

/**
 * Aplica overrides de simulação (quando presentes) sobre o config carregado
 * do banco, sem persistir nada — usado só pelo serviço de simulação Simples
 * x Lucro Real (`src/lib/simples-nacional/simulate-lucro-real.ts`). Extraída
 * como função pura pra ser testável sem mockar Prisma/ML.
 */
export function resolveConfigForGeneration(
  loadedConfig: TaxCompanyConfig,
  overrides?: GenerationOverrides,
): TaxCompanyConfig {
  if (!overrides) return loadedConfig;
  return {
    ...loadedConfig,
    ...(overrides.forceRegime !== undefined
      ? { taxRegime: overrides.forceRegime }
      : {}),
    ...(overrides.forceConsiderIcmsStRecuperavel !== undefined
      ? { considerIcmsStRecuperavel: overrides.forceConsiderIcmsStRecuperavel }
      : {}),
    ...(overrides.forceExcludeIcmsFromPisCofinsBase !== undefined
      ? { excludeIcmsFromPisCofinsBase: overrides.forceExcludeIcmsFromPisCofinsBase }
      : {}),
  };
}

export async function generateMonthlyTaxReport(input: {
  accessToken: string;
  sellerId: number;
  organizationId: string;
  year: number;
  month: number;
  overrides?: Record<string, ManualFiscalOverride>;
  onProgress?: (progress: GenerateMonthlyReportProgress) => void;
  /**
   * Uso interno exclusivo do simulador Simples x Lucro Real — nunca deve vir
   * de um body de request. Ver `GenerationOverrides`.
   */
  forceRegime?: "LUCRO_REAL";
  /** Idem — ver `GenerationOverrides`. */
  forceConsiderIcmsStRecuperavel?: boolean;
  /** Idem — ver `GenerationOverrides`. */
  forceExcludeIcmsFromPisCofinsBase?: boolean;
}): Promise<TaxReportPayload> {
  const started = Date.now();
  const { from, to } = getCalendarMonthRange(input.year, input.month);
  const overrides = input.overrides ?? {};

  input.onProgress?.({
    phase: "orders",
    message: "Buscando pedidos pagos do período…",
  });

  const orders = await fetchPaidOrdersByPeriod(
    input.accessToken,
    input.sellerId,
    from,
    to,
  );

  input.onProgress?.({
    phase: "orders",
    message: `Encontramos ${orders.length} pedido${orders.length === 1 ? "" : "s"} pago${orders.length === 1 ? "" : "s"} no período.`,
  });

  input.onProgress?.({
    phase: "billing",
    message: `Consultando dados fiscais de ${orders.length} pedido${orders.length === 1 ? "" : "s"}…`,
    current: 0,
    total: orders.length,
  });

  const concurrency = getTaxReportBillingConcurrency();
  let billingDone = 0;
  const freightCostByOrderId = new Map<string, number>();
  const billingResults = await mapWithConcurrency(
    orders,
    concurrency,
    async (order) => {
      const billing = order.id
        ? await fetchOrderBillingInfo(input.accessToken, order.id)
        : null;

      const shippingId = order.shipping?.id;
      if (order.id != null && shippingId != null) {
        try {
          const freight = await fetchShipmentCost(input.accessToken, shippingId);
          if (freight != null) {
            freightCostByOrderId.set(String(order.id), freight);
          }
        } catch (err) {
          console.error(
            `[tax-report] Falha ao buscar custo de frete do pedido ${order.id} (shipping ${shippingId}) — crédito de frete será 0.`,
            err,
          );
        }
      }

      billingDone += 1;
      if (billingDone % 10 === 0 || billingDone === orders.length) {
        input.onProgress?.({
          phase: "billing",
          message: `Dados fiscais: ${billingDone}/${orders.length}`,
          current: billingDone,
          total: orders.length,
        });
      }
      return { order, billing };
    },
  );

  const itemIds = [
    ...new Set(
      orders.flatMap((order) =>
        (order.order_items ?? [])
          .map((line) => itemIdFromOrderLine(line))
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
  const items = await fetchItemsByIdsBatched(input.accessToken, itemIds);
  const itemById = new Map(items.map((item) => [item.id, item]));

  // SKU "efetivo" por anúncio: segue o cadastro do Product vinculado via
  // mlItemId quando existe (estável mesmo se o SKU mudar no anúncio ML ou o
  // pedido carregar um snapshot de SKU antigo); cai pro texto de SKU da
  // linha do pedido quando não há vínculo. Ver docs no plano de migração de
  // identidade de produto (SKU -> mlItemId).
  const effectiveSkuByItemId = await resolveEffectiveSkuByItemId(
    input.organizationId,
    items.map((item) => ({ id: item.id, sku: getItemSku(item) })),
  );

  input.onProgress?.({
    phase: "compute",
    message: "Carregando custos dos produtos…",
  });

  const allSkus = [
    ...new Set([
      ...collectSkusFromOrders(orders, itemById),
      ...[...effectiveSkuByItemId.values()].filter(
        (sku): sku is string => Boolean(sku),
      ),
    ]),
  ];
  const custoBySku: Map<string, CustoProduto> = await loadCustoBySkuMap(
    input.organizationId,
    allSkus,
  );

  input.onProgress?.({
    phase: "compute",
    message: `Custos de ${custoBySku.size} SKU${custoBySku.size === 1 ? "" : "s"} carregados. Montando vendas…`,
  });

  const [loadedConfig, icmsRates, cbsIbsVigencia] = await Promise.all([
    loadTaxCompanyConfig(input.organizationId),
    loadIcmsRatesMap(),
    loadCbsIbsVigencia(input.year),
  ]);
  const config = resolveConfigForGeneration(loadedConfig, {
    forceRegime: input.forceRegime,
    forceConsiderIcmsStRecuperavel: input.forceConsiderIcmsStRecuperavel,
    forceExcludeIcmsFromPisCofinsBase: input.forceExcludeIcmsFromPisCofinsBase,
  });

  if (config.taxRegime !== "LUCRO_REAL") {
    throw new Error(
      "Apenas Lucro Real está habilitado na v1. Ajuste o regime em Configurações tributárias.",
    );
  }

  const contributorByCnpj = new Map<string, boolean>();
  const transacoes = [];

  for (const { order, billing } of billingResults) {
    const doc =
      billing?.buyer?.billing_info?.identification?.number?.replace(/\D/g, "") ??
      null;

    if (doc && doc.length === 14 && !contributorByCnpj.has(doc)) {
      const mlParsed = parseTaxpayerTypeFromMl(
        billing?.buyer?.billing_info?.taxes?.taxpayer_type?.description,
      );
      if (mlParsed !== null) {
        contributorByCnpj.set(doc, mlParsed);
      }
    }

    transacoes.push(
      ...buildTransacoesFromOrder({
        order,
        billing,
        itemById,
        custoBySku,
        contributorByCnpj,
        overrides,
        freightCostByOrderId,
        effectiveSkuByItemId,
      }),
    );
  }

  const receitaTotalByItem = new Map<string, number>();
  let receitaTotalMes = 0;
  for (const t of transacoes) {
    receitaTotalByItem.set(
      t.itemId,
      (receitaTotalByItem.get(t.itemId) ?? 0) + t.receitaBruta,
    );
    receitaTotalMes += t.receitaBruta;
  }

  input.onProgress?.({
    phase: "compute",
    message: "Buscando métricas de Ads do mês…",
  });

  let adsMetricsByItem = new Map<string, ItemAdMetrics>();
  try {
    const advertiserId = await fetchPadsAdvertiserId(input.accessToken);
    if (advertiserId !== null) {
      const { dateFrom, dateTo } = getProductAdsDateRangeForMonth(
        input.year,
        input.month,
      );
      if (isProductAdsMetricsRangeAvailable(dateFrom)) {
        const itemIdsWithSales = [...receitaTotalByItem.keys()].filter(Boolean);
        adsMetricsByItem = await fetchProductAdsMetricsByItem(input.accessToken, {
          advertiserId,
          siteId: "MLB",
          dateFrom,
          dateTo,
          itemIds: itemIdsWithSales.length > 0 && itemIdsWithSales.length <= 150
            ? itemIdsWithSales
            : undefined,
        });
      }
    }
  } catch (err) {
    console.error(
      "[tax-report] Falha ao buscar métricas de Ads — crédito de Ads será 0.",
      err,
    );
    adsMetricsByItem = new Map();
  }

  const [fixedCostItems, fixedCostExplicitValues, fixedCostExcludedMonths] =
    await Promise.all([
      loadTaxFixedCostItems(input.organizationId),
      loadTaxFixedCostExplicitValues(input.organizationId, input.year),
      loadTaxFixedCostExcludedMonths(input.organizationId, input.year),
    ]);
  const fixedCostResolution = resolveFixedCostCreditForMonth({
    items: fixedCostItems.map((item) => ({
      id: item.id,
      active: true,
      recurring: item.recurring,
      endYear: item.endYear,
      endMonth: item.endMonth,
    })),
    explicitValues: fixedCostExplicitValues,
    excludedMonths: fixedCostExcludedMonths,
    year: input.year,
    month: input.month,
  });

  input.onProgress?.({
    phase: "compute",
    message: "Calculando impostos por venda…",
    current: 0,
    total: transacoes.length,
  });

  const payload = calcularRelatorioFromTransacoes({
    transacoes,
    config,
    icmsRates,
    cbsIbsVigencia,
    year: input.year,
    month: input.month,
    overrides,
    adsMetricsByItem,
    receitaTotalByItem,
    receitaTotalMes,
    custosFixosBaseMes: fixedCostResolution.totalCreditavel,
    creditoCustosFixosBaseRegistrada: fixedCostResolution.totalRegistrado,
    creditoCustosFixosBaseCreditavel: fixedCostResolution.totalCreditavel,
    meta: {
      geradoEm: new Date().toISOString(),
      pedidosProcessados: orders.length,
      linhasProcessadas: transacoes.length,
      semBillingInfo: transacoes.filter((t) => t.dadosFiscaisIndisponiveis)
        .length,
      duracaoMs: Date.now() - started,
      taxRegime: config.taxRegime,
      originUf: config.originUf,
    },
    onComputeProgress: (current, total) => {
      if (current % 100 === 0 || current === total) {
        input.onProgress?.({
          phase: "compute",
          message: `Calculando impostos: ${current}/${total}`,
          current,
          total,
        });
      }
    },
  });

  input.onProgress?.({ phase: "done", message: "Relatório gerado." });
  return payload;
}

export async function saveTaxReportSnapshot(
  organizationId: string,
  sellerId: number,
  payload: TaxReportPayload,
): Promise<void> {
  const slim = slimTaxReportPayloadForStorage(payload);
  // payload acabou de ser gerado (agregados por SKU já calculados em
  // compute-report.ts), então é seguro extrair o resumo sem rodar reparo.
  const summary = stripTransacoesForResponse(payload);
  await prisma.taxReportMonthSnapshot.upsert({
    where: {
      sellerId_year_month: {
        sellerId,
        year: payload.year,
        month: payload.month,
      },
    },
    create: {
      organizationId,
      sellerId,
      year: payload.year,
      month: payload.month,
      generatedAt: new Date(payload.meta.geradoEm),
      payload: slim as object,
      payloadSummary: summary as object,
    },
    update: {
      generatedAt: new Date(payload.meta.geradoEm),
      payload: slim as object,
      payloadSummary: summary as object,
    },
  });
}

export async function loadTaxReportSnapshot(
  sellerId: number,
  year: number,
  month: number,
): Promise<TaxReportPayload | null> {
  const row = await prisma.taxReportMonthSnapshot.findUnique({
    where: { sellerId_year_month: { sellerId, year, month } },
  });
  if (!row) return null;
  const payload = row.payload as unknown as TaxReportPayload;
  return repairTaxReportPayload(sellerId, payload);
}

export type TaxReportSnapshotPeriod = {
  year: number;
  month: number;
  generatedAt: string;
};

/** Lista os períodos já apurados (sem carregar o payload completo). */
export async function listTaxReportSnapshotPeriods(
  sellerId: number,
): Promise<TaxReportSnapshotPeriod[]> {
  const rows = await prisma.taxReportMonthSnapshot.findMany({
    where: { sellerId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true, generatedAt: true },
  });
  return rows.map((row) => ({
    year: row.year,
    month: row.month,
    generatedAt: row.generatedAt.toISOString(),
  }));
}

export async function loadLatestTaxReportSnapshot(
  sellerId: number,
): Promise<TaxReportPayload | null> {
  const row = await prisma.taxReportMonthSnapshot.findFirst({
    where: { sellerId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  if (!row) return null;
  const payload = row.payload as unknown as TaxReportPayload;
  return repairTaxReportPayload(sellerId, payload);
}

/** Últimos `limit` snapshots do seller, do mais recente ao mais antigo. */
export async function loadRecentTaxReportSnapshots(
  sellerId: number,
  limit = 12,
): Promise<TaxReportPayload[]> {
  const rows = await prisma.taxReportMonthSnapshot.findMany({
    where: { sellerId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limit,
  });
  return Promise.all(
    rows.map((row) =>
      repairTaxReportPayload(sellerId, row.payload as unknown as TaxReportPayload),
    ),
  );
}

/**
 * Últimos `limit` snapshots do seller com período <= (year, month), do mais
 * recente ao mais antigo. Diferente de `loadRecentTaxReportSnapshots`, que
 * ancora em "agora" — esta ancora num mês de referência específico (ex.: o
 * mês de um DRE sendo montado), pra não aplicar retroativamente a % de um
 * relatório tributário mais recente a um período passado.
 */
export async function loadRecentTaxReportSnapshotsUpTo(
  sellerId: number,
  year: number,
  month: number,
  limit = 12,
): Promise<TaxReportPayload[]> {
  const rows = await prisma.taxReportMonthSnapshot.findMany({
    where: {
      sellerId,
      OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limit,
  });
  return Promise.all(
    rows.map((row) =>
      repairTaxReportPayload(sellerId, row.payload as unknown as TaxReportPayload),
    ),
  );
}

/**
 * Versão enxuta de `loadRecentTaxReportSnapshots`: lê só `payloadSummary`
 * (sem `porSku[].transacoes`) do Postgres, não a coluna `payload` completa.
 * Usada por `loadProductTaxFromLatestReport`, que só precisa de agregados por
 * SKU — evita trafegar o detalhamento por venda do banco a cada requisição
 * (era a maior fonte de Egress identificada). Ignora silenciosamente
 * snapshots ainda sem `payloadSummary` (pré-backfill); `loadProductTaxFromLatestReport`
 * já lida bem com menos de `limit` meses (cai para o snapshot anterior que
 * tiver o SKU).
 */
export async function loadRecentTaxReportSummaries(
  sellerId: number,
  limit = 12,
): Promise<TaxReportPayload[]> {
  const rows = await prisma.taxReportMonthSnapshot.findMany({
    where: { sellerId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limit,
    select: { payloadSummary: true },
  });
  return rows
    .filter((row) => row.payloadSummary !== null)
    .map((row) => row.payloadSummary as unknown as TaxReportPayload);
}

/** Versão enxuta de `loadRecentTaxReportSnapshotsUpTo` — ver `loadRecentTaxReportSummaries`. */
export async function loadRecentTaxReportSummariesUpTo(
  sellerId: number,
  year: number,
  month: number,
  limit = 12,
): Promise<TaxReportPayload[]> {
  const rows = await prisma.taxReportMonthSnapshot.findMany({
    where: {
      sellerId,
      OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limit,
    select: { payloadSummary: true },
  });
  return rows
    .filter((row) => row.payloadSummary !== null)
    .map((row) => row.payloadSummary as unknown as TaxReportPayload);
}
