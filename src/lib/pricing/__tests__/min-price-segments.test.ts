import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MinSalePriceInput } from "@/lib/pricing/financial-margin";
import { findMinSalePriceBySegments } from "@/lib/pricing/min-price-segments";
import type { MarginAtPriceParams } from "@/lib/pricing/refine-min-sale-price";

/**
 * Mercado sintético: taxa 12% do preço, imposto 10%, custo R$ 40 e frete
 * R$ 20 só a partir de R$ 79 (abaixo disso o frete não é do vendedor).
 *
 * Margem% = (0,78p − 40 − frete) / p. Meta 5%:
 * - abaixo de 79: p ≥ 40 / 0,73 ≈ 54,79
 * - a partir de 79: p ≥ 60 / 0,73 ≈ 82,19 → R$ 79,00–82,19 é faixa proibida
 */
const FEE_RATE = 0.12;
const FREE_SHIPPING_FROM = 79;

function shippingAt(price: number, flat = 20, threshold = FREE_SHIPPING_FROM) {
  return price >= threshold ? flat : 0;
}

function makeQuote(options?: {
  flat?: number;
  threshold?: number;
  failAt?: (price: number) => boolean;
}) {
  const calls: number[] = [];
  const quote = async (price: number) => {
    calls.push(price);
    if (options?.failAt?.(price)) return null;
    return {
      mlFeeAmount: Math.round(price * FEE_RATE * 100) / 100,
      shippingCost: shippingAt(price, options?.flat, options?.threshold),
    };
  };
  return { quote, calls };
}

function input(overrides: Partial<MinSalePriceInput> = {}): MinSalePriceInput {
  const salePrice = overrides.salePrice ?? 100;
  return {
    salePrice,
    mlFeeAmount: Math.round(salePrice * FEE_RATE * 100) / 100,
    shippingCost: shippingAt(salePrice),
    productCost: 40,
    extraCosts: 0,
    taxRatePercent: 10,
    targetMarginPercent: 5,
    marginBasis: "contribution",
    tacosPercent: 0,
    currentContributionMarginPercent: null,
    currentAfterAdsMarginPercent: null,
    ...overrides,
  };
}

function params(overrides: Partial<MarginAtPriceParams> = {}): MarginAtPriceParams {
  return {
    mlFeeRebate: 0,
    productCost: 40,
    extraCosts: 0,
    taxRatePercent: 10,
    listingTypeLabel: null,
    marginBasis: "contribution",
    tacosPercent: 0,
    adsCost: 0,
    adsUnitsSold: 0,
    adsMetricsAvailable: true,
    ...overrides,
  };
}

function assertNear(actual: number | null, expected: number, tolerance = 0.1) {
  assert.ok(actual !== null, "expected a price");
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ~${expected}, got ${actual}`,
  );
}

describe("findMinSalePriceBySegments", () => {
  it("finds the floor below the free-shipping threshold and flags the band above it", async () => {
    const { quote } = makeQuote();
    const result = await findMinSalePriceBySegments(
      input({ salePrice: 100, currentContributionMarginPercent: 18 }),
      params(),
      quote,
    );

    assert.equal(result.reason, "ok");
    assert.equal(result.refined, true);
    assertNear(result.minSalePrice, 54.8);
    assert.ok(result.minSalePrice! >= 54.79, "never below the true floor");
    assert.equal(result.bands.length, 1);
    assert.equal(result.bands[0].from, 79);
    assertNear(result.bands[0].to, 82.19);
  });

  it("also looks below today's price when today's price misses the target", async () => {
    // A R$ 81 o frete é do vendedor e a margem fica em ~3,9%: a busca antiga só
    // subia o preço e respondia ~R$ 82,20 — mas R$ 54,80 já sustenta 5%.
    const { quote } = makeQuote();
    const result = await findMinSalePriceBySegments(
      input({ salePrice: 81, currentContributionMarginPercent: 3.9 }),
      params(),
      quote,
    );

    assertNear(result.minSalePrice, 54.8);
    assert.equal(result.bands.length, 1);
    assertNear(result.bands[0].to, 82.19);
  });

  it("returns a single floor and no band when shipping never changes", async () => {
    const { quote } = makeQuote({ threshold: 0 });
    const result = await findMinSalePriceBySegments(
      input({
        salePrice: 100,
        shippingCost: 20,
        currentContributionMarginPercent: 18,
      }),
      params(),
      quote,
    );

    assertNear(result.minSalePrice, 82.2);
    assert.deepEqual(result.bands, []);
  });

  it("skips the cheap segment when it can never reach the target", async () => {
    // Custo R$ 70: abaixo de 79 precisaria de p ≥ 95,9 (impossível no segmento).
    const { quote } = makeQuote();
    const result = await findMinSalePriceBySegments(
      input({
        salePrice: 150,
        productCost: 70,
        currentContributionMarginPercent: 18,
      }),
      params({ productCost: 70 }),
      quote,
    );

    assertNear(result.minSalePrice, 123.29);
    assert.deepEqual(result.bands, []);
  });

  it("after ADS is the contribution floor at target + TACOS", async () => {
    // TACOS 3%: margem após ADS ≥ 5% ⇔ MC ≥ 8% → 40 / 0,70 ≈ 57,14 e 60 / 0,70 ≈ 85,71.
    const { quote } = makeQuote();
    const result = await findMinSalePriceBySegments(
      input({
        salePrice: 100,
        marginBasis: "afterAds",
        tacosPercent: 3,
        currentAfterAdsMarginPercent: 15,
      }),
      params({ marginBasis: "afterAds", tacosPercent: 3, adsCost: 30, adsUnitsSold: 10 }),
      quote,
    );

    assertNear(result.minSalePrice, 57.15);
    assert.equal(result.bands.length, 1);
    assert.equal(result.bands[0].from, 79);
    assertNear(result.bands[0].to, 85.71);
  });

  it("falls back to the formula estimate when a quote fails", async () => {
    const { quote } = makeQuote({ failAt: (price) => price < 70 });
    const result = await findMinSalePriceBySegments(
      input({ salePrice: 100, currentContributionMarginPercent: 18 }),
      params(),
      quote,
    );

    assert.equal(result.refined, false);
    assert.equal(result.reason, "ok");
    assert.ok(result.minSalePrice !== null && result.minSalePrice > 0);
    assert.deepEqual(result.bands, []);
  });

  it("reports impossible when costs + target eat the whole price", async () => {
    const { quote, calls } = makeQuote();
    const result = await findMinSalePriceBySegments(
      input({ taxRatePercent: 90 }),
      params({ taxRatePercent: 90 }),
      quote,
    );

    assert.equal(result.reason, "impossible");
    assert.equal(result.minSalePrice, null);
    assert.equal(calls.length, 0, "no ML quote for an impossible target");
  });

  it("uses the cheaper shipping-only quote to find the threshold", async () => {
    const { quote, calls } = makeQuote();
    const shippingCalls: number[] = [];
    const result = await findMinSalePriceBySegments(
      input({ salePrice: 100, currentContributionMarginPercent: 18 }),
      params(),
      quote,
      async (price) => {
        shippingCalls.push(price);
        return shippingAt(price);
      },
    );

    assertNear(result.minSalePrice, 54.8);
    assert.ok(shippingCalls.length > 0);
    assert.ok(
      calls.length < shippingCalls.length + 30,
      "threshold search does not go through the full quote",
    );
  });
});
