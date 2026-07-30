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
    conteudoImportacaoPercentual: 0,
    isMonophasic: false,
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
});
