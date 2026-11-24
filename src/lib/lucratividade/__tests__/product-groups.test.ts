import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinancialMargin } from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { computeMarginSummary } from "../margin-summary";
import { aggregateProductGroup, groupEvaluationRowsByProduct } from "../product-groups";

/** Linha de um anúncio com `marginPercent`% de margem a `price`. */
function row(opts: {
  id: string;
  principal?: string;
  price: number;
  marginPercent: number;
  units: number;
}): FinancialEvaluationRow {
  const breakdown = computeFinancialMargin({
    salePrice: opts.price,
    mlFeeAmount: opts.price * (1 - opts.marginPercent / 100),
    shippingCost: 0,
    productCost: 0,
    extraCosts: 0,
    taxRatePercent: 0,
  });
  return {
    mlItemId: opts.id,
    principalMlItemId: opts.principal ?? opts.id,
    salePrice: opts.price,
    breakdown,
    productCost: 0,
    taxRatePercent: 0,
    adsMetricsAvailable: false,
    marginAfterAdsPercent: null,
    marginAfterAdsValue: null,
    periodUnitsSold: opts.units,
    periodRevenue: opts.price * opts.units,
  } as unknown as FinancialEvaluationRow;
}

describe("groupEvaluationRowsByProduct", () => {
  it("joins the sale options of one product where the first one appears", () => {
    const rows = [
      row({ id: "MLB-P", principal: "MLB-C", price: 60, marginPercent: 10, units: 5 }),
      row({ id: "MLB-X", price: 30, marginPercent: 20, units: 3 }),
      row({ id: "MLB-C", price: 50, marginPercent: 20, units: 15 }),
    ];
    const groups = groupEvaluationRowsByProduct(rows);
    assert.deepEqual(
      groups.map((g) => [g.key, g.rows.map((r) => r.mlItemId)]),
      [
        ["MLB-C", ["MLB-P", "MLB-C"]],
        ["MLB-X", ["MLB-X"]],
      ],
    );
  });
});

describe("aggregateProductGroup", () => {
  const options = [
    row({ id: "MLB-C", price: 50, marginPercent: 20, units: 15 }),
    row({ id: "MLB-P", principal: "MLB-C", price: 60, marginPercent: 10, units: 5 }),
  ];
  const [group] = groupEvaluationRowsByProduct(options);

  it("period: sums sales and weights the margin by what each option sold", () => {
    const agg = aggregateProductGroup(group, false);
    assert.equal(agg.units, 20);
    assert.equal(agg.revenue, 1050);
    assert.equal(agg.price, 52.5);
    // (15 × 10 + 5 × 6) ÷ (15 × 50 + 5 × 60) = 180 ÷ 1050
    assert.equal(agg.marginPercent, 17.14);
    assert.equal(agg.marginValue, 9);
  });

  it("matches the summary of the same option rows (grouping is only visual)", () => {
    const summary = computeMarginSummary(options, { weighted: true });
    assert.equal(aggregateProductGroup(group, false).marginPercent, summary.contributionPercent);
  });

  it("simulation: shows the principal", () => {
    const agg = aggregateProductGroup(group, true);
    assert.equal(agg.lead.mlItemId, "MLB-C");
    assert.equal(agg.price, 50);
    assert.equal(agg.marginPercent, 20);
  });
});
