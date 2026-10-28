import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DreProductCostLevelingRecord } from "@/lib/dre/dre-product-cost-leveling-shared";
import { resolveCustoDaVenda } from "@/lib/tax-report/enrichment/aplicar-nivelamento";
import type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";

const cadastro: CustoProduto = {
  sku: "SKU-A",
  pricingCost: 60,
  unitCostNf: 60,
  purchaseIcmsPercent: 18,
  hasIcmsSt: false,
  saleIcmsPercent: 18,
  extraCosts: 2,
  isMonophasic: false,
  isImported: false,
  ipiPercent: 0,
};

const custoLookup = {
  byMlItemId: new Map([["MLB1", cadastro]]),
  bySku: new Map([["SKU-A", cadastro]]),
};

function leveling(overrides: Partial<DreProductCostLevelingRecord> = {}): DreProductCostLevelingRecord {
  return {
    sku: "SKU-A",
    productMlItemId: "MLB1",
    startDate: "2026-01-01",
    endDate: "2026-02-11",
    pricingCost: 45,
    hasIcmsSt: true,
    unitCostNf: 40,
    purchaseCostWithSt: 45,
    ipiPercent: 0,
    purchaseIcmsPercent: null,
    extraCosts: null,
    isMonophasic: null,
    isImported: null,
    saleIcmsPercent: null,
    ...overrides,
  };
}

describe("resolveCustoDaVenda", () => {
  it("uses the leveling (historical registration) on a sale inside its period", () => {
    const { custo, fonte } = resolveCustoDaVenda({
      itemId: "MLB1",
      sku: "SKU-A",
      // 22h BRT de 11/02 = 01h UTC de 12/02: o dia que vale é o de São Paulo.
      orderDate: "2026-02-12T01:00:00.000Z",
      custoLookup,
      levelings: [leveling()],
      year: 2026,
      month: 2,
    });
    assert.equal(fonte, "nivelamento");
    assert.equal(custo?.unitCostNf, 40);
    assert.equal(custo?.hasIcmsSt, true);
    assert.equal(custo?.purchaseCostWithSt, 45);
    assert.equal(custo?.pricingCost, 45);
    // Não informado no nivelamento antigo: fica o cadastro atual.
    assert.equal(custo?.purchaseIcmsPercent, 18);
    assert.equal(custo?.extraCosts, 2);
  });

  it("keeps the current registration outside the leveling period", () => {
    const { custo, fonte } = resolveCustoDaVenda({
      itemId: "MLB1",
      sku: "SKU-A",
      orderDate: "2026-02-20T15:00:00.000Z",
      custoLookup,
      levelings: [leveling()],
      year: 2026,
      month: 2,
    });
    assert.equal(fonte, "cadastro");
    assert.equal(custo?.unitCostNf, 60);
  });

  it("matches the leveling by listing, not by the SKU text", () => {
    const { fonte } = resolveCustoDaVenda({
      itemId: "MLB9",
      sku: "SKU-A",
      orderDate: "2026-01-15T15:00:00.000Z",
      custoLookup,
      levelings: [leveling()],
      year: 2026,
      month: 1,
    });
    assert.equal(fonte, "cadastro");
  });
});
