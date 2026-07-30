import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularRelatorioFromTransacoes } from "@/lib/tax-report/service/compute-report";
import {
  enrichTransacao,
  needsAliasCostRepair,
  needsCostEnrichmentRepair,
} from "@/lib/tax-report/repair-snapshot-apuracao";
import type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
import type {
  ApuracaoConsolidada,
  DetalhamentoTributario,
  TaxReportPayload,
} from "@/lib/tax-report/types";

const aliasMap = new Map<string, string>([["SKU-LEGADO", "SKU-ATUAL"]]);

const canonicalCusto: CustoProduto = {
  sku: "SKU-ATUAL",
  pricingCost: 80,
  unitCostNf: 100,
  purchaseIcmsPercent: 18,
  hasIcmsSt: false,
  saleIcmsPercent: 18,
  extraCosts: 0,
  isMonophasic: false,
  isImported: false,
  importContentPercent: 0,
};

function apuracaoStub(): ApuracaoConsolidada {
  return {
    pis: { debito: 1, credito: 0, liquido: 1 },
    cofins: { debito: 2, credito: 0, liquido: 2 },
    pisCofinsLiquido: 3,
    icms: {
      debito: 5,
      credito: 0,
      liquido: 5,
      icmsSemDifalDebito: 5,
      difalDebito: 0,
    },
    icmsARecolherSpEstimado: 5,
    difalARecolherEstimado: 0,
    difalPorUf: {},
    diagnostico: {
      receitaSemCustoCadastrado: 100,
      linhasSemCustoCadastrado: 1,
      creditoPisCofinsPerdidoEstimado: 0,
    },
  };
}

function aliasLineWithoutCost(): DetalhamentoTributario {
  return {
    transacao: {
      transactionKey: "alias-line",
      orderId: "1",
      orderDate: "2026-05-01",
      sku: "SKU-LEGADO",
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
      conteudoImportacaoPercentual: 0,
      isMonophasic: false,
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
    cbsIbs: null,
    impostoTotal: 25.58,
    margemOperacionalEstimada: 74.42,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
  };
}

function snapshotWithAliasLineAlreadyGrouped(): TaxReportPayload {
  const line = aliasLineWithoutCost();
  return {
    year: 2026,
    month: 5,
    consolidado: {
      faturamento: 100,
      pisCofinsLiquido: 7.58,
      icmsDifalTotal: 18,
      cbsIbsInformativoTotal: 0,
      margemOperacional: 74.42,
      transacoesIncluidas: 1,
      transacoesExcluidas: 0,
      transacoesSemBillingInfo: 0,
      apuracao: apuracaoStub(),
    },
    porSku: [
      {
        sku: "SKU-ATUAL",
        skuAliases: ["SKU-LEGADO"],
        quantidadeVendas: 1,
        unidadesVendidas: 1,
        receitaTotal: 100,
        impostoTotal: 25.58,
        impostoMedioPorVenda: 25.58,
        impostoMedioPercentual: 25.58,
        transacoes: [line],
      },
    ],
    transacoes: [],
    overrides: {},
    meta: {
      geradoEm: "2026-05-01T00:00:00.000Z",
      pedidosProcessados: 1,
      linhasProcessadas: 1,
      semBillingInfo: 0,
      duracaoMs: 100,
      taxRegime: "LUCRO_REAL",
      originUf: "SP",
    },
  };
}

describe("repairTaxReportPayload alias cost", () => {
  it("detects alias lines without unitCostNf even when porSku is already grouped", () => {
    const payload = snapshotWithAliasLineAlreadyGrouped();
    const detalhes = payload.porSku.flatMap((row) => row.transacoes);

    assert.equal(needsAliasCostRepair(detalhes, aliasMap), true);
  });

  it("re-enriches alias lines with canonical unitCostNf and recalculates credits", () => {
    const line = aliasLineWithoutCost();
    const custoBySku = new Map<string, CustoProduto>([
      ["SKU-LEGADO", canonicalCusto],
    ]);

    const enriched = enrichTransacao(line.transacao, custoBySku, aliasMap);
    assert.equal(enriched.unitCostNf, 100);

    assert.equal(
      needsCostEnrichmentRepair([line], custoBySku, aliasMap),
      true,
    );

    const recomputed = calcularRelatorioFromTransacoes({
      transacoes: [enriched],
      config: {
        taxRegime: "LUCRO_REAL",
        originUf: "SP",
        pisRatePercent: 1.65,
        cofinsRatePercent: 7.6,
        excludeIcmsFromPisCofinsBase: true,
        considerIcmsStRecuperavel: true,
      },
      icmsRates: new Map([
        ["SP", { uf: "SP", aliquotaBase: 18, fcp: 0 }],
      ]),
      cbsIbsVigencia: null,
      year: 2026,
      month: 5,
      overrides: {},
      meta: snapshotWithAliasLineAlreadyGrouped().meta,
      aliasMap,
    });

    const repairedLine = recomputed.porSku[0]?.transacoes[0];
    assert.ok(repairedLine);
    assert.equal(repairedLine.transacao.sku, "SKU-LEGADO");
    assert.equal(repairedLine.transacao.unitCostNf, 100);
    assert.ok((repairedLine.pisCofins?.creditoTotal ?? 0) > 0);
    assert.ok(repairedLine.icmsCreditoCompra != null);
    assert.equal(repairedLine.icmsCreditoCompra?.creditoTotal, 18);
  });

  it("resolves canonical cost when map is keyed only by canonical sku", () => {
    const line = aliasLineWithoutCost();
    const custoBySku = new Map<string, CustoProduto>([
      ["SKU-ATUAL", canonicalCusto],
    ]);

    const enriched = enrichTransacao(line.transacao, custoBySku, aliasMap);
    assert.equal(enriched.unitCostNf, 100);
    assert.equal(
      needsCostEnrichmentRepair([line], custoBySku, aliasMap),
      true,
    );
  });

  it("enriches transaction sku with double internal spaces via alias map", () => {
    const mxtAliasMap = new Map<string, string>([
      ["MXT - Cabo Guitar 10m (Próprio)", "MXT - Cabo 81063 10m (Próprio)"],
    ]);
    const line = aliasLineWithoutCost();
    line.transacao.sku = "MXT  - Cabo Guitar 10m (Próprio)";

    const custoBySku = new Map<string, CustoProduto>([
      [
        "MXT - Cabo Guitar 10m (Próprio)",
        { ...canonicalCusto, sku: "MXT - Cabo 81063 10m (Próprio)" },
      ],
    ]);

    const enriched = enrichTransacao(line.transacao, custoBySku, mxtAliasMap);
    assert.equal(enriched.unitCostNf, 100);
  });
});
