import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularIcmsCreditoCompra } from "@/lib/tax-report/calculators/icms-credito-compra";
import type { TransacaoVenda } from "@/lib/tax-report/types";

function tx(overrides: Partial<TransacaoVenda> = {}): TransacaoVenda {
  return {
    transactionKey: "1-A",
    orderId: "1",
    orderDate: "2026-01-01",
    sku: "A",
    itemId: "MLB",
    quantidade: 2,
    receitaBruta: 200,
    ufDestino: "RJ",
    tipoDocumento: "CPF",
    documento: null,
    contribuinteIcms: false,
    contribuinteSource: null,
    dadosFiscaisIndisponiveis: false,
    custoAquisicaoUnitario: 70,
    unitCostNf: 100,
    purchaseIcmsPercent: 18,
    hasIcmsSt: false,
    saleIcmsPercent: 18,
    extraCostsUnitario: 0,
    mercadoriaImportada: false,
    isMonophasic: false,
    saleFee: 0,
    ipiPercent: 0,
    ...overrides,
  };
}

describe("calcularIcmsCreditoCompra", () => {
  it("calculates credit from unitCostNf and purchase ICMS rate", () => {
    const result = calcularIcmsCreditoCompra(tx());
    assert.equal(result.baseUnitaria, 200);
    assert.equal(result.aliquotaPercent, 18);
    assert.equal(result.creditoTotal, 36);
  });

  it("returns zero for ST products sold within the origin UF", () => {
    const result = calcularIcmsCreditoCompra(
      tx({ hasIcmsSt: true, purchaseIcmsPercent: 18 }),
      true,
    );
    assert.equal(result.creditoTotal, 0);
    assert.equal(result.stRecuperavelTotal, 0);
  });

  it("returns zero without unitCostNf", () => {
    const result = calcularIcmsCreditoCompra(tx({ unitCostNf: null }));
    assert.equal(result.creditoTotal, 0);
  });

  it("recovers ICMS-ST when an ST product is sold to another state", () => {
    const result = calcularIcmsCreditoCompra(
      tx({
        hasIcmsSt: true,
        purchaseIcmsPercent: 0,
        unitCostNf: 100,
        purchaseCostWithSt: 118,
        quantidade: 2,
      }),
      false,
    );
    assert.equal(result.stRecuperavelTotal, 36);
    assert.equal(result.creditoTotal, 36);
  });

  it("does not recover ICMS-ST for interstate sale without purchaseCostWithSt", () => {
    const result = calcularIcmsCreditoCompra(
      tx({ hasIcmsSt: true, purchaseCostWithSt: null }),
      false,
    );
    assert.equal(result.stRecuperavelTotal, 0);
  });

  it("does not recover ICMS-ST for non-ST products even when interstate", () => {
    const result = calcularIcmsCreditoCompra(
      tx({ hasIcmsSt: false, purchaseIcmsPercent: 18 }),
      false,
    );
    assert.equal(result.stRecuperavelTotal, 0);
    assert.equal(result.creditoTotal, 36);
  });

  it("does not recover ICMS-ST when considerarStRecuperavel is disabled", () => {
    const result = calcularIcmsCreditoCompra(
      tx({
        hasIcmsSt: true,
        purchaseIcmsPercent: 0,
        unitCostNf: 100,
        purchaseCostWithSt: 118,
        quantidade: 2,
      }),
      false,
      false,
    );
    assert.equal(result.stRecuperavelTotal, 0);
    assert.equal(result.creditoTotal, 0);
  });

  it("recovers ICMS-ST when considerarStRecuperavel is enabled (default)", () => {
    const result = calcularIcmsCreditoCompra(
      tx({
        hasIcmsSt: true,
        purchaseIcmsPercent: 0,
        unitCostNf: 100,
        purchaseCostWithSt: 118,
        quantidade: 2,
      }),
      false,
      true,
    );
    assert.equal(result.stRecuperavelTotal, 36);
    assert.equal(result.creditoTotal, 36);
  });

  it("interestadual + ST + recuperável: soma crédito de entrada normal E o ressarcimento da ST", () => {
    const result = calcularIcmsCreditoCompra(
      tx({
        hasIcmsSt: true,
        purchaseIcmsPercent: 18,
        unitCostNf: 100,
        purchaseCostWithSt: 118,
        quantidade: 2,
      }),
      false,
      true,
    );
    // crédito de entrada normal: 100 * 18% * 2 = 36; ST recuperável: (118-100) * 2 = 36
    assert.equal(result.aliquotaPercent, 18);
    assert.equal(result.stRecuperavelTotal, 36);
    assert.equal(result.creditoTotal, 72);
  });

  it("interestadual + ST + recuperável desligado: crédito de entrada normal continua (só o ressarcimento é gated pelo switch)", () => {
    const result = calcularIcmsCreditoCompra(
      tx({
        hasIcmsSt: true,
        purchaseIcmsPercent: 18,
        unitCostNf: 100,
        purchaseCostWithSt: 118,
        quantidade: 2,
      }),
      false,
      false,
    );
    // crédito de entrada normal: 100 * 18% * 2 = 36; sem ressarcimento (switch desligado)
    assert.equal(result.aliquotaPercent, 18);
    assert.equal(result.stRecuperavelTotal, 0);
    assert.equal(result.creditoTotal, 36);
  });

  it("interna + ST (mesmo com purchaseIcmsPercent > 0): crédito de entrada continua zerado", () => {
    const result = calcularIcmsCreditoCompra(
      tx({
        hasIcmsSt: true,
        purchaseIcmsPercent: 18,
        unitCostNf: 100,
        purchaseCostWithSt: 118,
        quantidade: 2,
      }),
      true,
      true,
    );
    assert.equal(result.aliquotaPercent, 0);
    assert.equal(result.creditoTotal, 0);
  });
});
