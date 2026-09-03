import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import {
  enrichTransacao,
  needsCostEnrichmentRepair,
} from "@/lib/tax-report/repair-snapshot-apuracao";
import type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
import type { CustoLookup } from "@/lib/tax-report/enrichment/obter-custo-por-sku";
import type { DetalhamentoTributario, TaxReportPayload } from "@/lib/tax-report/types";

const custo: CustoProduto = {
  sku: "SKU-A",
  pricingCost: 80,
  unitCostNf: 100,
  purchaseIcmsPercent: 18,
  hasIcmsSt: false,
  saleIcmsPercent: 18,
  extraCosts: 0,
  isMonophasic: false,
  ipiPercent: 0,
  isImported: false,
};

function lineWithoutCost(): DetalhamentoTributario {
  return {
    transacao: {
      transactionKey: "line-1",
      orderId: "1",
      orderDate: "2026-05-01",
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
      custoAquisicaoUnitario: null,
      unitCostNf: null,
      purchaseIcmsPercent: 0,
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
      baseDebito: 82,
      baseCredito: 0,
      pisDebito: 1.35,
      cofinsDebito: 6.23,
      debitoTotal: 7.58,
      pisCredito: 0,
      cofinsCredito: 0,
      creditoTotal: 0,
      liquido: 7.58,
      icmsExcluidoDaBase: 18,
      excludedIcmsFromBase: true,
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
      icmsTotal: 18,
      isContribuinte: false,
      isOperacaoInterna: true,
    },
    icmsCreditoCompra: null,
    creditoOutrasDespesas: null,
    cbsIbs: null,
    impostoTotal: 25.58,
    margemOperacionalEstimada: 74.42,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
  };
}

const meta: TaxReportPayload["meta"] = {
  geradoEm: "2026-05-01T00:00:00.000Z",
  pedidosProcessados: 1,
  linhasProcessadas: 1,
  semBillingInfo: 0,
  duracaoMs: 100,
  taxRegime: "LUCRO_REAL",
  originUf: "SP",
};

describe("repairTaxReportPayload cost enrichment", () => {
  it("re-enriches a line without unitCostNf with the registered product cost and recalculates credits", () => {
    const line = lineWithoutCost();
    const custoLookup: CustoLookup = {
      byMlItemId: new Map([["MLB1", custo]]),
      bySku: new Map(),
    };

    const enriched = enrichTransacao(line.transacao, custoLookup);
    assert.equal(enriched.unitCostNf, 100);
    assert.equal(needsCostEnrichmentRepair([line], custoLookup), true);

    const recomputed = calcularRelatorioFromTransacoes({
      transacoes: [enriched],
      config: {
        taxRegime: "LUCRO_REAL",
        originUf: "SP",
        pisRatePercent: 1.65,
        cofinsRatePercent: 7.6,
        excludeIcmsFromPisCofinsBase: true,
        considerIcmsStRecuperavel: true,
        simplesAliquotaEfetivaPercent: null,
      },
      icmsRates: new Map([["SP", { uf: "SP", aliquotaBase: 18, fcp: 0 }]]),
      cbsIbsVigencia: null,
      year: 2026,
      month: 5,
      overrides: {},
      meta,
    });

    const repairedLine = recomputed.porSku[0]?.transacoes[0];
    assert.ok(repairedLine);
    assert.equal(repairedLine.transacao.sku, "SKU-A");
    assert.equal(repairedLine.transacao.unitCostNf, 100);
    assert.ok((repairedLine.pisCofins?.creditoTotal ?? 0) > 0);
    assert.ok(repairedLine.icmsCreditoCompra != null);
    assert.equal(repairedLine.icmsCreditoCompra?.creditoTotal, 18);
  });

  it("matches cost by normalized sku when the line's itemId has no registered product (fallback)", () => {
    const line = lineWithoutCost();
    line.transacao.sku = "MXT  - Cabo Guitar 10m (Próprio)";

    const custoLookup: CustoLookup = {
      byMlItemId: new Map(),
      bySku: new Map([
        ["MXT - Cabo Guitar 10m (Próprio)", { ...custo, sku: "MXT - Cabo Guitar 10m (Próprio)" }],
      ]),
    };

    const enriched = enrichTransacao(line.transacao, custoLookup);
    assert.equal(enriched.unitCostNf, 100);
  });

  it("does not enrich when no product cost is registered for the item nor the sku", () => {
    const line = lineWithoutCost();
    const custoLookup: CustoLookup = { byMlItemId: new Map(), bySku: new Map() };

    const enriched = enrichTransacao(line.transacao, custoLookup);
    assert.equal(enriched.unitCostNf, null);
    assert.equal(needsCostEnrichmentRepair([line], custoLookup), false);
  });

  it("resolves each line's cost by itemId when two lines share the same display sku text (Product.sku is not unique)", () => {
    const line1 = lineWithoutCost();
    line1.transacao.sku = "SKU-COLIDIU";

    const line2 = lineWithoutCost();
    line2.transacao.transactionKey = "line-2";
    line2.transacao.itemId = "MLB2";
    line2.transacao.sku = "SKU-COLIDIU";

    const custoLookup: CustoLookup = {
      byMlItemId: new Map([
        ["MLB1", { ...custo, unitCostNf: 100 }],
        ["MLB2", { ...custo, unitCostNf: 55 }],
      ]),
      bySku: new Map(),
    };

    const enriched1 = enrichTransacao(line1.transacao, custoLookup);
    const enriched2 = enrichTransacao(line2.transacao, custoLookup);
    assert.equal(enriched1.unitCostNf, 100);
    assert.equal(enriched2.unitCostNf, 55);
  });
});
