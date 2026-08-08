import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPeriodReportPayload,
  type MonthSnapshotEntry,
} from "@/lib/tax-report/service/period-report";
import type { DetalhamentoTributario, TaxReportPayload } from "@/lib/tax-report/types";

function detalhe(orderDate: string, sku: string, receita: number): DetalhamentoTributario {
  return {
    transacao: {
      transactionKey: `${sku}-${orderDate}-${receita}`,
      orderId: `ORD-${orderDate}`,
      orderDate: `${orderDate}T12:00:00.000Z`,
      sku,
      itemId: "MLB1",
      quantidade: 1,
      receitaBruta: receita,
      ufDestino: "SP",
      tipoDocumento: "CPF",
      documento: null,
      contribuinteIcms: null,
      contribuinteSource: null,
      dadosFiscaisIndisponiveis: false,
      custoAquisicaoUnitario: 10,
      unitCostNf: 12,
      purchaseIcmsPercent: 18,
      hasIcmsSt: false,
      saleIcmsPercent: 18,
      extraCostsUnitario: 0,
      mercadoriaImportada: false,
      isMonophasic: false,
      saleFee: 0,
      freightCost: 0,
      ipiPercent: 0,
    },
    pisCofins: {
      baseDebito: receita,
      baseCredito: 10,
      pisDebito: 1,
      cofinsDebito: 2,
      debitoTotal: 3,
      pisCredito: 0.5,
      cofinsCredito: 1,
      creditoTotal: 1.5,
      liquido: 1.5,
      icmsExcluidoDaBase: 0,
      excludedIcmsFromBase: false,
      pisRatePercent: 1.65,
      cofinsRatePercent: 7.6,
    },
    icmsDifal: {
      ufOrigem: "SP",
      ufDestino: "SP",
      aliquotaInterestadual: 0.12,
      aliquotaInternaTotal: 0.18,
      icmsInterestadual: 0,
      difal: 0,
      icmsTotal: 5,
      isContribuinte: false,
      isOperacaoInterna: true,
    },
    icmsCreditoCompra: null,
    creditoOutrasDespesas: null,
    cbsIbs: null,
    impostoTotal: 6.5,
    margemOperacionalEstimada: receita - 10 - 6.5,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
  };
}

function payloadFor(
  year: number,
  month: number,
  transacoes: DetalhamentoTributario[],
  overrides: TaxReportPayload["overrides"] = {},
): TaxReportPayload {
  return {
    year,
    month,
    consolidado: {
      faturamento: 0,
      pisCofinsLiquido: 0,
      icmsDifalTotal: 0,
      cbsIbsInformativoTotal: 0,
      margemOperacional: 0,
      transacoesIncluidas: transacoes.length,
      transacoesExcluidas: 0,
      transacoesSemBillingInfo: 0,
    },
    porSku: [
      {
        sku: "SKU-A",
        quantidadeVendas: transacoes.length,
        unidadesVendidas: transacoes.length,
        receitaTotal: transacoes.reduce((s, t) => s + t.transacao.receitaBruta, 0),
        impostoTotal: 0,
        impostoMedioPorVenda: 0,
        impostoMedioPercentual: 0,
        transacoes,
      },
    ],
    overrides,
    meta: {
      geradoEm: `${year}-${String(month).padStart(2, "0")}-15T00:00:00.000Z`,
      pedidosProcessados: transacoes.length,
      linhasProcessadas: transacoes.length,
      semBillingInfo: 0,
      duracaoMs: 0,
      taxRegime: "LUCRO_REAL",
      originUf: "SP",
    },
  };
}

describe("buildPeriodReportPayload", () => {
  it("filters transactions by orderDate within the range, combining two months", () => {
    const july = payloadFor(2026, 7, [
      detalhe("2026-07-20", "SKU-A", 100),
      detalhe("2026-07-31", "SKU-A", 200),
    ]);
    const august = payloadFor(2026, 8, [
      detalhe("2026-08-01", "SKU-A", 300),
      detalhe("2026-08-10", "SKU-A", 9999), // fora do range
    ]);

    const snapshots: MonthSnapshotEntry[] = [
      { month: { year: 2026, month: 7 }, payload: july },
      { month: { year: 2026, month: 8 }, payload: august },
    ];

    const { payload, missingMonths } = buildPeriodReportPayload(
      snapshots,
      "2026-07-25",
      "2026-08-05",
    );

    assert.equal(missingMonths.length, 0);
    assert.equal(payload.porSku[0]?.receitaTotal, 500); // 200 (31/07) + 300 (01/08)
    assert.equal(payload.consolidado.faturamento, 500);
    assert.equal(payload.periodFrom, "2026-07-25");
    assert.equal(payload.periodTo, "2026-08-05");
  });

  it("reports missing months when a snapshot is null", () => {
    const august = payloadFor(2026, 8, [detalhe("2026-08-01", "SKU-A", 100)]);
    const snapshots: MonthSnapshotEntry[] = [
      { month: { year: 2026, month: 7 }, payload: null },
      { month: { year: 2026, month: 8 }, payload: august },
    ];

    const { payload, missingMonths } = buildPeriodReportPayload(
      snapshots,
      "2026-07-01",
      "2026-08-31",
    );

    assert.deepEqual(missingMonths, [{ year: 2026, month: 7 }]);
    assert.equal(payload.porSku[0]?.receitaTotal, 100);
  });

  it("merges overrides from multiple snapshots without losing keys", () => {
    const july = payloadFor(2026, 7, [detalhe("2026-07-05", "SKU-A", 10)], {
      "key-july": { ufDestino: "SP", contribuinteIcms: false },
    });
    const august = payloadFor(2026, 8, [detalhe("2026-08-05", "SKU-A", 20)], {
      "key-august": { ufDestino: "RJ", contribuinteIcms: true },
    });

    const snapshots: MonthSnapshotEntry[] = [
      { month: { year: 2026, month: 7 }, payload: july },
      { month: { year: 2026, month: 8 }, payload: august },
    ];

    const { payload } = buildPeriodReportPayload(
      snapshots,
      "2026-07-01",
      "2026-08-31",
    );

    assert.deepEqual(Object.keys(payload.overrides).sort(), [
      "key-august",
      "key-july",
    ]);
  });
});
