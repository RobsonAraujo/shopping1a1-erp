import { prisma } from "@/lib/db";
import { fetchItemsByIdsBatched, fetchPaidOrdersByPeriod } from "@/lib/mercadolibre/api";
import { getCalendarMonthRange } from "@/lib/mercadolibre/revenue-periods";
import { getTaxReportBillingConcurrency, isCnpjWsEnabled } from "@/lib/tax-report/config";
import { createContributorProvider, resolveContributorStatus } from "@/lib/tax-report/contributor";
import { buildTransacoesFromOrder } from "@/lib/tax-report/enrichment/build-transacao-venda";
import { obterCustoPorSku } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import type { CustoProduto } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import {
  fetchOrderBillingInfo,
  mapWithConcurrency,
} from "@/lib/tax-report/ml/billing-info-client";
import { itemIdFromOrderLine } from "@/lib/tax-report/ml/sku-from-order-line";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import {
  loadCbsIbsVigencia,
  loadIcmsRatesMap,
  loadTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";
import type { ManualFiscalOverride, TaxReportPayload } from "@/lib/tax-report/types";

export type GenerateMonthlyReportProgress = {
  phase: "orders" | "billing" | "compute" | "done";
  message: string;
  current?: number;
  total?: number;
};

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

  const contributorProvider = createContributorProvider();
  const contributorByCnpj = new Map<string, boolean>();
  let stubFallbackCount = 0;
  const custoBySku = new Map<string, CustoProduto>();

  input.onProgress?.({
    phase: "compute",
    message: "Calculando impostos por venda…",
  });

  const config = await loadTaxCompanyConfig();
  if (config.taxRegime !== "LUCRO_REAL") {
    throw new Error(
      "Apenas Lucro Real está habilitado na v1. Ajuste o regime em Configurações tributárias.",
    );
  }

  const icmsRates = await loadIcmsRatesMap();
  const cbsIbsVigencia = await loadCbsIbsVigencia(input.year);

  const transacoes = [];

  for (const { order, billing } of billingResults) {
    const doc =
      billing?.buyer?.billing_info?.identification?.number?.replace(/\D/g, "") ??
      null;
    const mlTaxpayer =
      billing?.buyer?.billing_info?.taxes?.taxpayer_type?.description ?? null;

    if (doc && doc.length === 14 && !contributorByCnpj.has(doc)) {
      const fromMl = billing?.buyer?.billing_info?.taxes?.taxpayer_type
        ?.description;
      const mlParsed =
        fromMl?.toLowerCase().includes("contribuinte") &&
        !fromMl.toLowerCase().includes("não") &&
        !fromMl.toLowerCase().includes("nao")
          ? true
          : fromMl?.toLowerCase().includes("não contribuinte") ||
              fromMl?.toLowerCase().includes("nao contribuinte")
            ? false
            : null;

      if (mlParsed !== null) {
        contributorByCnpj.set(doc, mlParsed);
      } else {
        const resolved = await resolveContributorStatus({
          cnpj: doc,
          mlTaxpayerType: null,
          provider: contributorProvider,
        });
        contributorByCnpj.set(doc, resolved.contribuinteIcms);
        if (resolved.source === "stub_fallback") {
          stubFallbackCount += 1;
        }
      }
    }

    const orderTransacoes = buildTransacoesFromOrder({
      order,
      billing,
      itemById,
      custoBySku,
      contributorByCnpj,
      overrides,
    });

    for (const tx of orderTransacoes) {
      if (!custoBySku.has(tx.sku)) {
        const custo = await obterCustoPorSku(tx.sku);
        if (custo) custoBySku.set(tx.sku, custo);
      }
    }

    transacoes.push(...orderTransacoes);
  }

  for (const tx of transacoes) {
    if (!custoBySku.has(tx.sku)) {
      const custo = await obterCustoPorSku(tx.sku);
      if (custo) custoBySku.set(tx.sku, custo);
    }
    const custo = custoBySku.get(tx.sku);
    if (custo) {
      tx.custoAquisicaoUnitario = custo.pricingCost;
      tx.extraCostsUnitario = custo.extraCosts;
      tx.isMonophasic = custo.isMonophasic;
      tx.mercadoriaImportada = custo.isImported;
      tx.conteudoImportacaoPercentual = custo.importContentPercent;
    }
  }

  const cnpjWsEnabled = isCnpjWsEnabled();
  const contributorWarnings: string[] = [];
  if (!cnpjWsEnabled) {
    contributorWarnings.push(
      "Verificação externa de CNPJ contribuinte (CNPJ.ws) está desligada. PJ sem taxpayer_type no ML é tratado como não-contribuinte (aplica DIFAL — postura conservadora).",
    );
  }
  if (stubFallbackCount > 0) {
    contributorWarnings.push(
      `${stubFallbackCount} CNPJ(s) usaram fallback interno por falta de taxpayer_type no ML${cnpjWsEnabled ? " ou falha na API" : ""}.`,
    );
  }

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
      contributorVerification: {
        mode: cnpjWsEnabled ? "cnpj_ws" : "stub",
        cnpjWsEnabled,
        stubFallbackCount,
        warnings: contributorWarnings,
      },
    },
  });

  input.onProgress?.({ phase: "done", message: "Relatório gerado." });
  return payload;
}

export async function saveTaxReportSnapshot(
  sellerId: number,
  payload: TaxReportPayload,
): Promise<void> {
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
      payload: payload as object,
    },
    update: {
      generatedAt: new Date(payload.meta.geradoEm),
      payload: payload as object,
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
  return row.payload as unknown as TaxReportPayload;
}
