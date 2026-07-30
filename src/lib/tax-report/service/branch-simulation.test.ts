import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aplicarCreditoPresumido,
  buildBranchSimulationResult,
  computeScenarioForTransacao,
  estimarIcmsEntradaPercent,
  isSupportedBranchSimulationUf,
} from "@/lib/tax-report/service/branch-simulation";
import type {
  DetalhamentoTributario,
  IcmsDifalBreakdown,
  IcmsRateRow,
  TaxCompanyConfig,
  TransacaoVenda,
} from "@/lib/tax-report/types";

function tx(overrides: Partial<TransacaoVenda> = {}): TransacaoVenda {
  return {
    transactionKey: "1-SKU",
    orderId: "1",
    orderDate: "2026-01-15T12:00:00.000Z",
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
    custoAquisicaoUnitario: 50,
    unitCostNf: 50,
    purchaseIcmsPercent: 18,
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    saleIcmsPercent: 18,
    extraCostsUnitario: 0,
    mercadoriaImportada: false,
    conteudoImportacaoPercentual: 0,
    isMonophasic: false,
    ...overrides,
  };
}

const RATES = new Map<string, IcmsRateRow>([
  ["SP", { uf: "SP", aliquotaBase: 0.18, fcp: 0 }],
  ["SC", { uf: "SC", aliquotaBase: 0.17, fcp: 0 }],
  ["RJ", { uf: "RJ", aliquotaBase: 0.2, fcp: 0.02 }],
]);

const CONFIG: TaxCompanyConfig = {
  taxRegime: "LUCRO_REAL",
  originUf: "SP",
  pisRatePercent: 1.65,
  cofinsRatePercent: 7.6,
  excludeIcmsFromPisCofinsBase: true,
  considerIcmsStRecuperavel: true,
};

function icmsBreakdown(
  overrides: Partial<IcmsDifalBreakdown> = {},
): IcmsDifalBreakdown {
  return {
    ufOrigem: "SP",
    ufDestino: "RJ",
    aliquotaInterestadual: 0.12,
    aliquotaInternaTotal: 0.22,
    icmsInterestadual: 24,
    difal: 20,
    icmsTotal: 44,
    isContribuinte: false,
    isOperacaoInterna: false,
    ...overrides,
  };
}

describe("isSupportedBranchSimulationUf", () => {
  it("accepts Sul/Sudeste UFs", () => {
    assert.equal(isSupportedBranchSimulationUf("SC"), true);
    assert.equal(isSupportedBranchSimulationUf("SP"), true);
  });

  it("rejects UFs outside Sul/Sudeste", () => {
    assert.equal(isSupportedBranchSimulationUf("BA"), false);
    assert.equal(isSupportedBranchSimulationUf("GO"), false);
  });
});

describe("aplicarCreditoPresumido", () => {
  it("reduces only icmsInterestadual, keeps difal, recomputes icmsTotal", () => {
    const result = aplicarCreditoPresumido(icmsBreakdown(), 50);
    assert.equal(result.icmsInterestadual, 12);
    assert.equal(result.difal, 20);
    assert.equal(result.icmsTotal, 32);
  });

  it("does nothing for internal operations", () => {
    const interna = icmsBreakdown({ isOperacaoInterna: true, difal: 0 });
    const result = aplicarCreditoPresumido(interna, 90);
    assert.deepEqual(result, interna);
  });

  it("does nothing when creditoPresumidoPercent is zero", () => {
    const result = aplicarCreditoPresumido(icmsBreakdown(), 0);
    assert.equal(result.icmsInterestadual, 24);
  });

  it("still reduces icmsInterestadual for contribuinte buyers (difal=0)", () => {
    const contribuinte = icmsBreakdown({ isContribuinte: true, difal: 0, icmsTotal: 24 });
    const result = aplicarCreditoPresumido(contribuinte, 50);
    assert.equal(result.icmsInterestadual, 12);
    assert.equal(result.icmsTotal, 12);
  });
});

describe("estimarIcmsEntradaPercent", () => {
  it("uses the internal rate when fornecedor and destino are the same UF", () => {
    const percent = estimarIcmsEntradaPercent({
      ufFornecedor: "SC",
      ufDestino: "SC",
      mercadoriaImportada: false,
      conteudoImportacaoPercentual: 0,
      icmsRates: RATES,
    });
    assert.equal(percent, 17);
  });

  it("uses the interstate rate when fornecedor and destino differ", () => {
    const percent = estimarIcmsEntradaPercent({
      ufFornecedor: "SP",
      ufDestino: "SC",
      mercadoriaImportada: false,
      conteudoImportacaoPercentual: 0,
      icmsRates: RATES,
    });
    assert.equal(percent, 12);
  });

  it("returns 0 for unknown UFs", () => {
    const percent = estimarIcmsEntradaPercent({
      ufFornecedor: "",
      ufDestino: "SC",
      mercadoriaImportada: false,
      conteudoImportacaoPercentual: 0,
      icmsRates: RATES,
    });
    assert.equal(percent, 0);
  });
});

describe("computeScenarioForTransacao", () => {
  it("flips an internal sale (SP→SP) into interstate when origin moves to SC", () => {
    const transacao = tx({ ufDestino: "SP", hasIcmsSt: true, purchaseCostWithSt: 65 });
    const scenario = computeScenarioForTransacao(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });
    assert.equal(scenario.icmsDifal?.isOperacaoInterna, false);
  });

  it("flips an interstate sale (SP→SC) into internal when origin moves to SC", () => {
    const transacao = tx({ ufDestino: "SC" });
    const scenario = computeScenarioForTransacao(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });
    assert.equal(scenario.icmsDifal?.isOperacaoInterna, true);
  });

  it("recalculates purchaseIcmsPercent using the fornecedor UF for non-ST products", () => {
    const transacao = tx({ sku: "ACME 001", ufDestino: "RJ", unitCostNf: 50 });
    const withoutSupplier = computeScenarioForTransacao(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });
    const withSupplier = computeScenarioForTransacao(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
      supplierUfByFornecedor: new Map([["ACME", "SP"]]),
    });

    // sem UF de fornecedor: usa purchaseIcmsPercent cadastral (18%) => credito 9
    assert.equal(withoutSupplier.icmsCreditoCompra.creditoTotal, 9);
    // com fornecedor em SP vendendo pra filial em SC: alíquota interestadual 12% => credito 6
    assert.equal(withSupplier.icmsCreditoCompra.creditoTotal, 6);
  });

  it("does not touch purchaseIcmsPercent for ST products even with fornecedor UF informed", () => {
    const transacao = tx({
      sku: "ACME 001",
      ufDestino: "RJ",
      hasIcmsSt: true,
      purchaseCostWithSt: 65,
    });
    const withSupplier = computeScenarioForTransacao(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
      supplierUfByFornecedor: new Map([["ACME", "SP"]]),
    });
    // credito de entrada continua zerado (ST), só pode haver ST recuperável
    assert.equal(
      withSupplier.icmsCreditoCompra.creditoTotal,
      withSupplier.icmsCreditoCompra.stRecuperavelTotal,
    );
  });

  it("applies creditoPresumidoPercent only to the interstate portion", () => {
    const transacao = tx({ ufDestino: "RJ" });
    const withoutIncentive = computeScenarioForTransacao(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });
    const withIncentive = computeScenarioForTransacao(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 50,
    });
    assert.ok(
      (withIncentive.icmsDifal?.icmsTotal ?? 0) <
        (withoutIncentive.icmsDifal?.icmsTotal ?? 0),
    );
  });
});

function detalhe(
  transacao: TransacaoVenda,
  overrides: Partial<DetalhamentoTributario> = {},
): DetalhamentoTributario {
  return {
    transacao,
    pisCofins: {
      baseDebito: 82,
      baseCredito: 41,
      pisDebito: 1.35,
      cofinsDebito: 6.23,
      debitoTotal: 7.58,
      pisCredito: 0.68,
      cofinsCredito: 3.12,
      creditoTotal: 3.8,
      liquido: 3.78,
      icmsExcluidoDaBase: 18,
      excludedIcmsFromBase: true,
      pisRatePercent: 1.65,
      cofinsRatePercent: 7.6,
    },
    icmsDifal: icmsBreakdown({ isOperacaoInterna: true, icmsTotal: 18, difal: 0, icmsInterestadual: 0 }),
    icmsCreditoCompra: { baseUnitaria: 50, aliquotaPercent: 18, creditoTotal: 9, stRecuperavelTotal: 0 },
    cbsIbs: null,
    impostoTotal: 12.78,
    margemOperacionalEstimada: 30,
    incluidoNaApuracao: true,
    memoriaCalculo: [],
    ...overrides,
  };
}

describe("buildBranchSimulationResult", () => {
  it("aggregates totals, porSku and porUf using stored 'atual' vs recomputed 'cenario'", () => {
    const transacao = tx({ ufDestino: "SP", sku: "SKU-A" });
    const det = detalhe(transacao);

    const result = buildBranchSimulationResult([det], {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });

    assert.equal(result.transacoesConsideradas, 1);
    assert.equal(result.totais.atual, 12.78);
    assert.equal(result.totais.receitaTotal, 100);
    assert.equal(result.totais.atualPercent, 12.78);
    assert.equal(result.porSku.length, 1);
    assert.equal(result.porSku[0].key, "SKU-A");
    assert.equal(result.porSku[0].atualPercent, 12.78);
    assert.equal(result.porSku[0].receitaTotal, 100);
    assert.equal(result.porUf.length, 1);
    assert.equal(result.porUf[0].key, "SP");

    // componentes: atual vem do det armazenado, cenário do recálculo
    assert.equal(result.totais.icmsDebito.atual, 18);
    assert.equal(result.totais.icmsCreditoEntrada.atual, 9);
    assert.equal(result.totais.icmsStRecuperavel.atual, 0);
    assert.equal(result.totais.pisCofinsLiquido.atual, 3.78);
    assert.equal(
      result.porSku[0].icmsDebito.cenario,
      result.totais.icmsDebito.cenario,
    );
  });

  it("ignores lines not included in the apuração", () => {
    const det = detalhe(tx(), { incluidoNaApuracao: false });
    const result = buildBranchSimulationResult([det], {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });
    assert.equal(result.transacoesConsideradas, 0);
    assert.equal(result.totais.atual, 0);
  });
});
