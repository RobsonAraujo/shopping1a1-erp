import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinancialMargin } from "@/lib/pricing/financial-margin";
import {
  computeMarginSummary,
  marginExclusionReason,
} from "../margin-summary";

/** Linha mínima com margem de `marginPercent`% num preço de `price`. */
function row(opts: {
  price?: number;
  marginPercent: number;
  units?: number;
  productCost?: number | null;
  taxRatePercent?: number | null;
  afterAdsPercent?: number | null;
  pending?: boolean;
  kitMissingSkus?: string[];
}) {
  const price = opts.price ?? 100;
  const productCost = opts.productCost === undefined ? 0 : opts.productCost;
  const taxRatePercent =
    opts.taxRatePercent === undefined ? 0 : opts.taxRatePercent;
  // custo "fixo" que deixa exatamente `marginPercent` de margem
  const breakdown = computeFinancialMargin({
    salePrice: price,
    mlFeeAmount: price * (1 - opts.marginPercent / 100),
    shippingCost: 0,
    productCost,
    extraCosts: 0,
    taxRatePercent,
  });
  const units = opts.units ?? 1;
  const afterAds = opts.afterAdsPercent ?? null;
  return {
    pending: opts.pending,
    breakdown,
    productCost,
    taxRatePercent,
    kitMissingSkus: opts.kitMissingSkus,
    adsMetricsAvailable: afterAds !== null,
    marginAfterAdsPercent: afterAds,
    marginAfterAdsValue: afterAds !== null ? (price * afterAds) / 100 : null,
    periodUnitsSold: units,
    periodRevenue: price * units,
  };
}

describe("computeMarginSummary — weighted (período)", () => {
  it("17% em 1 un. + 5% em 100 un. dá ~5,1%, não 11%", () => {
    const summary = computeMarginSummary(
      [row({ marginPercent: 17, units: 1 }), row({ marginPercent: 5, units: 100 })],
      { weighted: true },
    );
    assert.equal(summary.contributionPercent, 5.12);
    assert.equal(summary.contributionValueTotal, 517);
    assert.equal(summary.includedRevenue, 10100);
    assert.equal(summary.includedUnits, 101);
  });

  it("pondera por faturamento, não por unidades (preços diferentes)", () => {
    // 10% num item de R$ 1.000 (1 un.) + 30% num de R$ 10 (10 un.)
    const summary = computeMarginSummary(
      [
        row({ price: 1000, marginPercent: 10, units: 1 }),
        row({ price: 10, marginPercent: 30, units: 10 }),
      ],
      { weighted: true },
    );
    // (100 + 30) / (1000 + 100) = 11,82%
    assert.equal(summary.contributionPercent, 11.82);
  });

  it("deixa sem alíquota / sem custo / kit incompleto fora, com receita", () => {
    const summary = computeMarginSummary(
      [
        row({ marginPercent: 10, units: 10 }),
        row({ marginPercent: 60, units: 5, productCost: null }),
        row({ marginPercent: 40, units: 3, taxRatePercent: null }),
        row({ marginPercent: 50, units: 2, kitMissingSkus: ["A"] }),
      ],
      { weighted: true },
    );
    assert.equal(summary.contributionPercent, 10);
    assert.equal(summary.includedCount, 1);
    assert.equal(summary.excluded.count, 3);
    assert.equal(summary.excluded.revenue, 1000);
    assert.equal(summary.excluded.units, 10);
    assert.deepEqual(summary.excluded.byReason, {
      missing_cost: 1,
      missing_tax: 1,
      kit_incomplete: 1,
      incomplete: 0,
    });
    assert.equal(summary.totalRevenue, 2000);
  });

  it("ignora linhas pending (média parcial)", () => {
    const summary = computeMarginSummary(
      [row({ marginPercent: 10 }), row({ marginPercent: 90, pending: true })],
      { weighted: true },
    );
    assert.equal(summary.contributionPercent, 10);
    assert.equal(summary.pendingCount, 1);
    assert.equal(summary.excluded.count, 0);
  });

  it("após ADS só sobre anúncios com ADS e null sem nenhum", () => {
    const withAds = computeMarginSummary(
      [
        row({ marginPercent: 20, units: 1, afterAdsPercent: 10 }),
        row({ marginPercent: 20, units: 1 }),
      ],
      { weighted: true },
    );
    assert.equal(withAds.afterAdsPercent, 10);
    assert.equal(withAds.afterAdsIncludedCount, 1);

    const noAds = computeMarginSummary([row({ marginPercent: 20 })], {
      weighted: true,
    });
    assert.equal(noAds.afterAdsPercent, null);
  });
});

describe("computeMarginSummary — simple (simulação)", () => {
  it("média simples, cada anúncio pesa igual", () => {
    const summary = computeMarginSummary(
      [row({ marginPercent: 17, units: 1 }), row({ marginPercent: 5, units: 100 })],
      { weighted: false },
    );
    assert.equal(summary.contributionPercent, 11);
    assert.equal(summary.contributionValueTotal, null);
  });

  it("também exclui sem alíquota e sem custo", () => {
    const summary = computeMarginSummary(
      [
        row({ marginPercent: 10 }),
        row({ marginPercent: 70, productCost: null }),
        row({ marginPercent: 40, taxRatePercent: null }),
      ],
      { weighted: false },
    );
    assert.equal(summary.contributionPercent, 10);
    assert.equal(summary.includedCount, 1);
    assert.equal(summary.excluded.count, 2);
  });
});

describe("marginExclusionReason", () => {
  it("prioriza erro de cálculo, kit, custo e alíquota nessa ordem", () => {
    assert.equal(
      marginExclusionReason({ ...row({ marginPercent: 1 }), breakdown: null }),
      "incomplete",
    );
    assert.equal(
      marginExclusionReason(
        row({ marginPercent: 1, productCost: null, taxRatePercent: null }),
      ),
      "missing_cost",
    );
    assert.equal(marginExclusionReason(row({ marginPercent: 1 })), null);
  });
});
