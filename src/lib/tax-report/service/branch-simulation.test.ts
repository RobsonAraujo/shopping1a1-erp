import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aplicarCreditoPresumido,
  buildBranchSimulationResult,
  buildEntradaInfo,
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
    isMonophasic: false,
    saleFee: 0,
    ipiPercent: 0,
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
      icmsRates: RATES,
    });
    assert.equal(percent, 17);
  });

  it("uses the interstate rate when fornecedor and destino differ", () => {
    const percent = estimarIcmsEntradaPercent({
      ufFornecedor: "SP",
      ufDestino: "SC",
      mercadoriaImportada: false,
      icmsRates: RATES,
    });
    assert.equal(percent, 12);
  });

  it("returns 0 for unknown UFs", () => {
    const percent = estimarIcmsEntradaPercent({
      ufFornecedor: "",
      ufDestino: "SC",
      mercadoriaImportada: false,
      icmsRates: RATES,
    });
    assert.equal(percent, 0);
  });
});

describe("buildEntradaInfo", () => {
  it("returns null when there is no supplierUfByFornecedor", () => {
    const transacao = tx({ sku: "ACME 001" });
    const info = buildEntradaInfo(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });
    assert.equal(info, null);
  });

  it("returns null for ST products", () => {
    const transacao = tx({ sku: "ACME 001", hasIcmsSt: true });
    const info = buildEntradaInfo(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
      supplierUfByFornecedor: new Map([["ACME", "SC"]]),
    });
    assert.equal(info, null);
  });

  it("flags an internal purchase when fornecedor and filial share the UF", () => {
    const transacao = tx({ sku: "ACME 001" });
    const info = buildEntradaInfo(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
      supplierUfByFornecedor: new Map([["ACME", "SC"]]),
    });
    assert.ok(info);
    assert.equal(info!.isOperacaoInterna, true);
    assert.equal(info!.purchaseIcmsPercentEstimado, 17);
  });

  it("flags an interstate purchase when fornecedor and filial differ", () => {
    const transacao = tx({ sku: "ACME 001" });
    const info = buildEntradaInfo(transacao, {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
      supplierUfByFornecedor: new Map([["ACME", "SP"]]),
    });
    assert.ok(info);
    assert.equal(info!.isOperacaoInterna, false);
    assert.equal(info!.purchaseIcmsPercentEstimado, 12);
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
    // UF de fornecedor é ignorada para ST — resultado idêntico com ou sem ela
    assert.deepEqual(withSupplier.icmsCreditoCompra, withoutSupplier.icmsCreditoCompra);
    // venda interestadual + ST recuperável: soma o crédito de entrada normal
    // (alíquota cadastral 18% sobre unitCostNf 50 = 9) com o ressarcimento da
    // ST (65 - 50 = 15)
    assert.equal(withSupplier.icmsCreditoCompra.stRecuperavelTotal, 15);
    assert.equal(withSupplier.icmsCreditoCompra.creditoTotal, 24);
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
    creditoOutrasDespesas: null,
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

  it("builds porSkuUf with one row per (sku, uf) combination and rate metadata", () => {
    const detSp = detalhe(tx({ sku: "SKU-A", ufDestino: "SP" }));
    const detRj = detalhe(
      tx({ sku: "SKU-A", ufDestino: "RJ", transactionKey: "2-SKU" }),
      {
        icmsDifal: icmsBreakdown({ isOperacaoInterna: false, icmsTotal: 44 }),
      },
    );

    const result = buildBranchSimulationResult([detSp, detRj], {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
    });

    assert.equal(result.porSkuUf.length, 2);
    const sp = result.porSkuUf.find((r) => r.uf === "SP")!;
    const rj = result.porSkuUf.find((r) => r.uf === "RJ")!;
    assert.equal(sp.sku, "SKU-A");
    assert.equal(sp.isOperacaoInterna, false); // SC -> SP é interestadual
    assert.equal(rj.isOperacaoInterna, false); // SC -> RJ é interestadual
    assert.equal(sp.contribuinteMisto, false);
  });

  it("exposes entradaInfo on the porSku row when a fornecedor UF is known", () => {
    const det = detalhe(tx({ sku: "ACME 001" }));
    const result = buildBranchSimulationResult([det], {
      config: { ...CONFIG, originUf: "SC" },
      icmsRates: RATES,
      creditoPresumidoPercent: 0,
      supplierUfByFornecedor: new Map([["ACME", "SC"]]),
    });

    const row = result.porSku.find((r) => r.key === "ACME 001")!;
    assert.ok(row.entradaInfo);
    assert.equal(row.entradaInfo!.isOperacaoInterna, true);
  });
});
