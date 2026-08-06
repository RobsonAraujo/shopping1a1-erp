import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularPisCofins } from "@/lib/tax-report/calculators/pis-cofins";
import type { TaxCompanyConfig, TransacaoVenda } from "@/lib/tax-report/types";

const config: TaxCompanyConfig = {
  taxRegime: "LUCRO_REAL",
  originUf: "SP",
  pisRatePercent: 1.65,
  cofinsRatePercent: 7.6,
  excludeIcmsFromPisCofinsBase: true,
  considerIcmsStRecuperavel: true,
};

function tx(overrides: Partial<TransacaoVenda> = {}): TransacaoVenda {
  return {
    transactionKey: "1-A",
    orderId: "1",
    orderDate: "2026-01-01",
    sku: "A",
    itemId: "MLB",
    quantidade: 1,
    receitaBruta: 100,
    ufDestino: "RJ",
    tipoDocumento: "CPF",
    documento: null,
    contribuinteIcms: false,
    contribuinteSource: null,
    dadosFiscaisIndisponiveis: false,
    custoAquisicaoUnitario: 40,
    unitCostNf: 50,
    purchaseIcmsPercent: 18,
    hasIcmsSt: false,
    saleIcmsPercent: 18,
    extraCostsUnitario: 0,
    mercadoriaImportada: false,
    conteudoImportacaoPercentual: 0,
    isMonophasic: false,
    saleFee: 0,
    ipiPercent: 0,
    ...overrides,
  };
}

describe("calcularPisCofins", () => {
  it("excludes ICMS from base when configured (RE 574.706)", () => {
    const result = calcularPisCofins({
      transacao: tx(),
      config,
      icmsDestacado: 12,
      isOperacaoInterna: true,
    });
    assert.equal(result.baseDebito, 88);
    assert.equal(result.icmsExcluidoDaBase, 12);
    assert.ok(result.liquido > 0);
  });

  it("returns zero for monophasic products", () => {
    const result = calcularPisCofins({
      transacao: tx({ isMonophasic: true }),
      config,
      icmsDestacado: 0,
      isOperacaoInterna: true,
    });
    assert.equal(result.liquido, 0);
    assert.equal(result.debitoTotal, 0);
  });

  it("credits on unitCostNf total, not pricingCost", () => {
    const result = calcularPisCofins({
      transacao: tx({
        unitCostNf: 100,
        purchaseIcmsPercent: 18,
        custoAquisicaoUnitario: 74,
        quantidade: 1,
      }),
      config,
      icmsDestacado: 0,
      isOperacaoInterna: true,
    });
    assert.equal(result.baseCredito, 100);
    assert.equal(result.pisCredito, 1.65);
    assert.equal(result.cofinsCredito, 7.6);
    assert.ok(result.creditoTotal > result.baseCredito * 0.09);
  });

  it("ST + venda interna: base de crédito usa custo cheio com ST", () => {
    const result = calcularPisCofins({
      transacao: tx({
        unitCostNf: 100,
        purchaseIcmsPercent: 18,
        hasIcmsSt: true,
        purchaseCostWithSt: 112,
      }),
      config,
      icmsDestacado: 0,
      isOperacaoInterna: true,
    });
    assert.equal(result.baseCredito, 112);
  });

  it("ST + venda interestadual + ressarcimento habilitado: base de crédito usa custo NF cheio", () => {
    const result = calcularPisCofins({
      transacao: tx({
        unitCostNf: 100,
        purchaseIcmsPercent: 18,
        hasIcmsSt: true,
        purchaseCostWithSt: 112,
      }),
      config,
      icmsDestacado: 0,
      isOperacaoInterna: false,
    });
    assert.equal(result.baseCredito, 100);
  });

  it("ST + venda interestadual + ressarcimento desligado: mantém custo cheio com ST", () => {
    const result = calcularPisCofins({
      transacao: tx({
        unitCostNf: 100,
        purchaseIcmsPercent: 18,
        hasIcmsSt: true,
        purchaseCostWithSt: 112,
      }),
      config: { ...config, considerIcmsStRecuperavel: false },
      icmsDestacado: 0,
      isOperacaoInterna: false,
    });
    assert.equal(result.baseCredito, 112);
  });
});
