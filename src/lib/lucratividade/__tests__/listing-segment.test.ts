import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinancialMargin } from "@/lib/pricing/financial-margin";
import { computeMarginSummary } from "@/lib/lucratividade/margin-summary";
import {
  filterRowsBySegment,
  rowInSegment,
} from "@/lib/lucratividade/listing-segment";

type Row = Parameters<typeof computeMarginSummary>[0][number] & {
  mlItemId: string;
  catalogListing: boolean;
};

function row(
  id: string,
  opts: { price: number; cost: number | null; units: number; catalog: boolean },
): Row {
  const breakdown = computeFinancialMargin({
    salePrice: opts.price,
    mlFeeAmount: opts.price * 0.12,
    shippingCost: 5,
    productCost: opts.cost,
    extraCosts: 0,
    taxRatePercent: 10,
    listingTypeLabel: "Clássico",
  });
  return {
    mlItemId: id,
    catalogListing: opts.catalog,
    pending: false,
    breakdown,
    productCost: opts.cost,
    taxRatePercent: 10,
    kitMissingSkus: [],
    adsMetricsAvailable: false,
    marginAfterAdsPercent: null,
    marginAfterAdsValue: null,
    periodUnitsSold: opts.units,
    periodRevenue: opts.price * opts.units,
  };
}

// próprio: 100 − 12 − 5 − 50 − 10 = R$ 23/un. (23%)
// catálogo: 200 − 24 − 5 − 150 − 20 = R$ 1/un. (0,5%)
const own = row("MLB1", { price: 100, cost: 50, units: 10, catalog: false });
const catalog = row("MLB2", { price: 200, cost: 150, units: 20, catalog: true });
const ownNoCost = row("MLB3", { price: 80, cost: null, units: 5, catalog: false });
const rows = [own, catalog, ownNoCost];

describe("listing segment", () => {
  it("separa próprios e catálogo; Todos devolve tudo", () => {
    assert.equal(rowInSegment(catalog, "catalog"), true);
    assert.equal(rowInSegment(catalog, "own"), false);
    assert.equal(rowInSegment(own, "all"), true);
    assert.deepEqual(
      filterRowsBySegment(rows, "own").map((r) => r.mlItemId),
      ["MLB1", "MLB3"],
    );
    assert.deepEqual(
      filterRowsBySegment(rows, "catalog").map((r) => r.mlItemId),
      ["MLB2"],
    );
    assert.equal(filterRowsBySegment(rows, "all"), rows);
  });

  it("faturamento de próprios + catálogo = Todos, e cada margem é ponderada no seu recorte", () => {
    const all = computeMarginSummary(rows, { weighted: true });
    const ownSummary = computeMarginSummary(filterRowsBySegment(rows, "own"), {
      weighted: true,
    });
    const catalogSummary = computeMarginSummary(
      filterRowsBySegment(rows, "catalog"),
      { weighted: true },
    );

    assert.equal(ownSummary.totalRevenue + catalogSummary.totalRevenue, all.totalRevenue);
    assert.equal(all.totalRevenue, 1000 + 4000 + 400);

    // sem custo fica fora da média, mas entra no faturamento do recorte
    assert.equal(ownSummary.contributionPercent, 23);
    assert.equal(ownSummary.totalRevenue, 1400);
    assert.equal(ownSummary.excluded.count, 1);

    assert.equal(catalogSummary.contributionPercent, 0.5);
    assert.equal(catalogSummary.contributionValueTotal, 20);

    // Todos: (230 + 20) ÷ (1000 + 4000) = 5%
    assert.equal(all.contributionPercent, 5);
  });
});
