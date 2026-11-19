import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveCostFromNf,
  maxProductCostAtPrice,
  nfBasisFromProduct,
  nfDiffersFromEffective,
  nfUnitPriceForCost,
  type CalculatorNfBasis,
} from "@/lib/calculadora/purchase-cost";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

function inputs(overrides: Partial<RotinaPricingInputs> = {}): RotinaPricingInputs {
  return {
    productCost: 50,
    extraCosts: 0,
    taxRatePercent: 10,
    mlFeeRebate: null,
    listingTypeId: "gold_special",
    listingTypeLabel: "Clássico",
    adsMetricsAvailable: true,
    tacosPercent: 4,
    adsCost: 8,
    adsUnitsSold: 2,
    ...overrides,
  };
}

function nf(overrides: Partial<CalculatorNfBasis> = {}): CalculatorNfBasis {
  return { kind: "nf", unitCostNf: 40, ipiPercent: 0, stFactor: null, units: 1, ...overrides };
}

/** O veredito do simulador com o custo pedido. */
function meets(
  price: number,
  costs: { mlFeeAmount: number; shippingCost: number },
  base: RotinaPricingInputs,
  cost: number,
  target: number,
) {
  return simulateMarginAtPrice(price, costs, { ...base, productCost: cost }, target).meetsTarget;
}

describe("maxProductCostAtPrice", () => {
  it("is the cost where the margin after ADS lands on the target, and one cent more misses it", () => {
    // 100 − 12 (taxa) − 10 (imposto) − 4 (ADS) − 6 (meta) = 68.
    const costs = { mlFeeAmount: 12, shippingCost: 0 };
    const max = maxProductCostAtPrice(100, costs, inputs(), 6);
    assert.equal(max, 68);
    assert.equal(meets(100, costs, inputs(), 68, 6), true);
    assert.equal(meets(100, costs, inputs(), 68.01, 6), false);
  });

  it("holds the round-trip on odd prices, shipping, extras and a fee rebate", () => {
    const costs = { mlFeeAmount: 11.42, shippingCost: 21.45 };
    const base = inputs({ extraCosts: 1.3, mlFeeRebate: 2.15, taxRatePercent: 9.37, tacosPercent: 3.21 });
    for (const target of [0, 3, 6, 12.5]) {
      const max = maxProductCostAtPrice(167.28, costs, base, target);
      assert.ok(max !== null && max > 0, `sem custo máximo para ${target}%`);
      assert.equal(meets(167.28, costs, base, max, target), true);
      assert.equal(meets(167.28, costs, base, Math.round((max + 0.01) * 100) / 100, target), false);
    }
  });

  it("decides by MC when the ADS is not usable (spend without sales)", () => {
    const costs = { mlFeeAmount: 12, shippingCost: 0 };
    const base = inputs({ tacosPercent: null, adsCost: 4.2, adsUnitsSold: 0 });
    // Sem ADS na conta: 100 − 12 − 10 − 6 = 72.
    assert.equal(maxProductCostAtPrice(100, costs, base, 6), 72);
  });

  it("returns null when not even a free product reaches the target, or the price was not quoted", () => {
    const costs = { mlFeeAmount: 60, shippingCost: 30 };
    assert.equal(maxProductCostAtPrice(100, costs, inputs(), 6), null);
    assert.equal(maxProductCostAtPrice(100, null, inputs(), 6), null);
  });

  it("does not depend on the cost already in the inputs", () => {
    const costs = { mlFeeAmount: 12, shippingCost: 0 };
    assert.equal(
      maxProductCostAtPrice(100, costs, inputs({ productCost: 10 }), 6),
      maxProductCostAtPrice(100, costs, inputs({ productCost: 90 }), 6),
    );
  });
});

describe("NF ↔ custo da conta", () => {
  it("adds the IPI and divides by the kit units", () => {
    const basis = nf({ ipiPercent: 3.25 });
    assert.equal(effectiveCostFromNf(40, basis), 41.3);
    // O maior preço na NF que cabe em R$ 41,30 é R$ 40,00 (nunca passa do limite).
    assert.equal(nfUnitPriceForCost(41.3, basis), 40);
    assert.ok(effectiveCostFromNf(nfUnitPriceForCost(41.29, basis), basis) <= 41.29);

    const kit = nf({ ipiPercent: 5, units: 2 });
    assert.equal(effectiveCostFromNf(20, kit), 42);
    assert.equal(nfUnitPriceForCost(42, kit), 20);
  });

  it("estimates the ST by the cadastro proportion", () => {
    const basis = nf({ stFactor: 1.2 });
    assert.equal(effectiveCostFromNf(50, basis), 60);
    assert.equal(nfUnitPriceForCost(60, basis), 50);
  });

  it("only converts when NF and the margin cost differ", () => {
    assert.equal(nfDiffersFromEffective(nf()), false);
    assert.equal(nfDiffersFromEffective(nf({ ipiPercent: 5 })), true);
    assert.equal(nfDiffersFromEffective(nf({ units: 3 })), true);
    assert.equal(nfDiffersFromEffective({ kind: "effective", reason: "kit" }), false);
  });
});

describe("nfBasisFromProduct", () => {
  const product = {
    unitCostNf: 40,
    purchaseIcmsPercent: 12,
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    ipiPercent: 3.25,
  };

  it("uses the cadastro only when it rebuilds the cost of the reading", () => {
    assert.deepEqual(nfBasisFromProduct(product, 1, 41.3), {
      kind: "nf",
      unitCostNf: 40,
      ipiPercent: 3.25,
      stFactor: null,
      units: 1,
    });
    assert.equal(nfBasisFromProduct(product, 2, 82.6)?.units, 2);
    // Outro custo na leitura (outro produto, cadastro mudou): não converte.
    assert.equal(nfBasisFromProduct(product, 1, 45), null);
  });

  it("takes the ST ratio from the cadastro, and gives up without a NF cost", () => {
    const withSt = { ...product, hasIcmsSt: true, purchaseCostWithSt: 48, ipiPercent: 0 };
    assert.equal(nfBasisFromProduct(withSt, 1, 48)?.stFactor, 1.2);
    assert.equal(nfBasisFromProduct({ ...product, unitCostNf: 0 }, 1, 0), null);
  });
});
