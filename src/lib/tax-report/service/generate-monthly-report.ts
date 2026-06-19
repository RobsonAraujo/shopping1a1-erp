import { prisma } from "@/lib/db";
import { fetchItemsByIdsBatched, fetchPaidOrdersByPeriod } from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import { getCalendarMonthRange } from "@/lib/mercadolibre/revenue-periods";
import { getTaxReportBillingConcurrency } from "@/lib/tax-report/config";
import { buildTransacoesFromOrder } from "@/lib/tax-report/enrichment/build-transacao-venda";
import {
  loadCustoBySkuMap,
  type CustoProduto,
} from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import {
  fetchOrderBillingInfo,
  mapWithConcurrency,
  parseTaxpayerTypeFromMl,
} from "@/lib/tax-report/ml/billing-info-client";
import {
  itemIdFromOrderLine,
  skuFromOrderLineWithFallback,
} from "@/lib/tax-report/ml/sku-from-order-line";
import { repairTaxReportPayload } from "@/lib/tax-report/repair-snapshot-apuracao";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import { loadSkuAliasMap } from "@/lib/product-sku-alias-data";
import {
  loadCbsIbsVigencia,
  loadIcmsRatesMap,
  loadTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";
import type { ManualFiscalOverride, TaxReportPayload } from "@/lib/tax-report/types";

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

export async function generateMonthlyTaxReport(input: {
  accessToken: string;
  sellerId: number;
  year: number;
  month: number;
  overrides?: Record<string, ManualFiscalOverride>;
  onProgress?: (progress: GenerateMonthlyReportProgress) => void;
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
  const billingResults = await mapWithConcurrency(
    orders,
    concurrency,
    async (order) => {
      const billing = order.id
        ? await fetchOrderBillingInfo(input.accessToken, order.id)
        : null;
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

  input.onProgress?.({
    phase: "compute",
    message: "Carregando custos dos produtos…",
  });

  const allSkus = collectSkusFromOrders(orders, itemById);
  const aliasMap = await loadSkuAliasMap();
  const custoBySku: Map<string, CustoProduto> = await loadCustoBySkuMap(
    allSkus,
    aliasMap,
  );

  input.onProgress?.({
    phase: "compute",
    message: `Custos de ${custoBySku.size} SKU${custoBySku.size === 1 ? "" : "s"} carregados. Montando vendas…`,
  });

  const [config, icmsRates, cbsIbsVigencia] = await Promise.all([
    loadTaxCompanyConfig(),
    loadIcmsRatesMap(),
    loadCbsIbsVigencia(input.year),
  ]);

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
      }),
    );
  }

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
    aliasMap,
  });

  input.onProgress?.({ phase: "done", message: "Relatório gerado." });
  return payload;
}

export async function saveTaxReportSnapshot(
  sellerId: number,
  payload: TaxReportPayload,
): Promise<void> {
  const slim = slimTaxReportPayloadForStorage(payload);
  await prisma.taxReportMonthSnapshot.upsert({
    where: {
      sellerId_year_month: {
        sellerId,
        year: payload.year,
        month: payload.month,
      },
    },
    create: {
      sellerId,
      year: payload.year,
      month: payload.month,
      generatedAt: new Date(payload.meta.geradoEm),
      payload: slim as object,
    },
    update: {
      generatedAt: new Date(payload.meta.geradoEm),
      payload: slim as object,
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
  return repairTaxReportPayload(payload);
}
