import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemAdMetrics } from "@/lib/mercadolibre/product-ads-metrics";
import { impostoOperacionalTotalRelatorio } from "@/lib/tax-report/imposto-operacional";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import {
  buildReportInputsFromTransactions,
  collectDetalhes,
} from "@/lib/tax-report/service/report-inputs";
import type {
  IcmsRateRow,
  TaxCompanyConfig,
  TaxReportPayload,
  TransacaoVenda,
} from "@/lib/tax-report/types";

const config: TaxCompanyConfig = {
  taxRegime: "LUCRO_REAL",
  originUf: "SP",
  pisRatePercent: 1.65,
  cofinsRatePercent: 7.6,
  excludeIcmsFromPisCofinsBase: true,
  considerIcmsStRecuperavel: true,
  simplesAliquotaEfetivaPercent: null,
};

const icmsRates = new Map<string, IcmsRateRow>([
  ["SP", { uf: "SP", aliquotaBase: 0.18, fcp: 0 }],
  ["RJ", { uf: "RJ", aliquotaBase: 0.2, fcp: 0.02 }],
]);

function sale(overrides: Partial<TransacaoVenda>): TransacaoVenda {
  return {
    transactionKey: `${overrides.orderId ?? "1"}-${overrides.itemId ?? "MLB1"}`,
    orderId: "1",
    orderDate: "2026-07-10T15:00:00.000Z",
    sku: "SKU-A",
    itemId: "MLB1",
    quantidade: 1,
    receitaBruta: 100,
    ufDestino: "SP",
    tipoDocumento: "CPF",
    documento: null,
    contribuinteIcms: false,
    contribuinteSource: null,
    dadosFiscaisIndisponiveis: false,
    custoAquisicaoUnitario: 40,
    unitCostNf: 40,
    purchaseIcmsPercent: 12,
    hasIcmsSt: false,
    saleIcmsPercent: 18,
    extraCostsUnitario: 0,
    mercadoriaImportada: false,
    isMonophasic: false,
    saleFee: 12,
    freightCost: 8,
    ipiPercent: 0,
    ...overrides,
  };
}

const meta: TaxReportPayload["meta"] = {
  geradoEm: "2026-08-02T00:00:00.000Z",
  pedidosProcessados: 3,
  linhasProcessadas: 3,
  semBillingInfo: 0,
  duracaoMs: 0,
  taxRegime: "LUCRO_REAL",
  originUf: "SP",
};

function ads(itemId: string, cost: number): ItemAdMetrics {
  return {
    itemId,
    status: null,
    cost,
    acosPercent: null,
    totalAmount: 0,
    organicAmount: 0,
    unitsQuantity: 0,
    totalRevenue: 0,
    tacosPercent: null,
  };
}

describe("buildReportInputsFromTransactions — ida e volta", () => {
  it("recalculating over the saved sales reproduces the generated report, ads and fixed-cost credits included", () => {
    const transacoes = [
      sale({ orderId: "1", itemId: "MLB1", receitaBruta: 100 }),
      sale({ orderId: "2", itemId: "MLB1", receitaBruta: 300, ufDestino: "RJ" }),
      sale({ orderId: "3", itemId: "MLB2", sku: "SKU-B", receitaBruta: 200 }),
    ];
    const fresh = buildReportInputsFromTransactions(transacoes);
    const generated = calcularRelatorioFromTransacoes({
      transacoes,
      config,
      icmsRates,
      cbsIbsVigencia: null,
      year: 2026,
      month: 7,
      overrides: {},
      meta,
      adsMetricsByItem: new Map([
        ["MLB1", ads("MLB1", 50)],
        ["MLB2", ads("MLB2", 20)],
      ]),
      receitaTotalByItem: fresh.receitaTotalByItem,
      receitaTotalMes: fresh.receitaTotalMes,
      custosFixosBaseMes: 1_000,
      creditoCustosFixosBaseRegistrada: 1_000,
      creditoCustosFixosBaseCreditavel: 1_000,
    });

    // Só o que fica gravado: as vendas com os cálculos (sem a API de Ads).
    const detalhes = collectDetalhes(generated);
    const saved = buildReportInputsFromTransactions(
      detalhes.map((d) => d.transacao),
      detalhes,
    );
    const recomputed = calcularRelatorioFromTransacoes({
      transacoes: detalhes.map((d) => d.transacao),
      config,
      icmsRates,
      cbsIbsVigencia: null,
      year: 2026,
      month: 7,
      overrides: {},
      meta,
      adsMetricsByItem: saved.adsMetricsByItem,
      receitaTotalByItem: saved.receitaTotalByItem,
      receitaTotalMes: saved.receitaTotalMes,
      custosFixosBaseMes: 1_000,
      creditoCustosFixosBaseRegistrada: 1_000,
      creditoCustosFixosBaseCreditavel: 1_000,
    });

    assert.ok((generated.consolidado.creditoOutrasDespesasTotal ?? 0) > 0);
    assert.equal(
      recomputed.consolidado.creditoOutrasDespesasTotal,
      generated.consolidado.creditoOutrasDespesasTotal,
    );
    assert.equal(
      recomputed.consolidado.creditoCustosFixosTotal,
      generated.consolidado.creditoCustosFixosTotal,
    );
    assert.equal(
      impostoOperacionalTotalRelatorio(recomputed),
      impostoOperacionalTotalRelatorio(generated),
    );
    assert.deepEqual(
      recomputed.porSku.map((row) => [row.mlItemId, row.impostoOperacionalTotal]),
      generated.porSku.map((row) => [row.mlItemId, row.impostoOperacionalTotal]),
    );
  });

  it("stores the month's operational tax total in the consolidated report", () => {
    const transacoes = [sale({ receitaBruta: 100 })];
    const inputs = buildReportInputsFromTransactions(transacoes);
    const report = calcularRelatorioFromTransacoes({
      transacoes,
      config,
      icmsRates,
      cbsIbsVigencia: null,
      year: 2026,
      month: 7,
      overrides: {},
      meta,
      receitaTotalByItem: inputs.receitaTotalByItem,
      receitaTotalMes: inputs.receitaTotalMes,
    });
    const sumOfSkus = report.porSku.reduce(
      (sum, row) => sum + (row.impostoOperacionalTotal ?? 0),
      0,
    );
    assert.equal(report.consolidado.impostoOperacionalTotal, Math.round(sumOfSkus * 100) / 100);
  });
});
