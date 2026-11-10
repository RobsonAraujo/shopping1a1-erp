import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveMinMarginPercent,
  effectiveTacosTargetPercent,
  evaluateCatalogRules,
  evaluateRefreshRules,
  marginForRules,
} from "@/lib/rotina/rules";
import { NOW, TZ, catalogLive, listing, settings } from "./fixtures";

function rules(
  overrides: Parameters<typeof listing>[0] = {},
  ctx: Partial<Parameters<typeof evaluateRefreshRules>[1]> = {},
) {
  return evaluateRefreshRules(listing(overrides), {
    settings: settings(),
    target: null,
    now: NOW,
    timeZone: TZ,
    ...ctx,
  });
}

describe("effective targets", () => {
  it("uses the listing override before the segment default", () => {
    const s = settings({ ownMinMarginPercent: 2, catalogMinMarginPercent: 5 });
    assert.equal(effectiveMinMarginPercent(false, s), 2);
    assert.equal(effectiveMinMarginPercent(true, s), 5);
    assert.equal(
      effectiveMinMarginPercent(true, s, { minMarginPercent: 8, tacosTargetPercent: null }),
      8,
    );
    assert.equal(
      effectiveMinMarginPercent(false, s, { minMarginPercent: 0, tacosTargetPercent: null }),
      0,
      "zero is a real override, not 'unset'",
    );
    assert.equal(effectiveTacosTargetPercent(s), 10);
    assert.equal(
      effectiveTacosTargetPercent(s, { minMarginPercent: null, tacosTargetPercent: 6 }),
      6,
    );
  });
});

describe("evaluateRefreshRules — promoções", () => {
  it("flags a missing promotion only when the price lookup worked", () => {
    assert.ok(rules({ hasPromotion: false }).includes("promo_missing"));
    assert.ok(
      !rules({ hasPromotion: false, promotionKnown: false }).includes("promo_missing"),
      "a failed lookup is not 'no promotion'",
    );
  });

  it("flags a promotion ending within the configured days", () => {
    assert.ok(rules({ promotionEndsAt: "2026-11-12T03:00:00.000Z" }).includes("promo_expiring"));
    assert.ok(!rules({ promotionEndsAt: "2026-11-20T03:00:00.000Z" }).includes("promo_expiring"));
    assert.ok(
      rules(
        { promotionEndsAt: "2026-11-20T03:00:00.000Z" },
        { settings: settings({ promotionExpiringSoonDays: 10 }) },
      ).includes("promo_expiring"),
    );
  });

  it("never flags catalog or paused listings for promotions", () => {
    assert.ok(!rules({ catalogListing: true, hasPromotion: false }).includes("promo_missing"));
    assert.deepEqual(rules({ mlStatus: "paused", hasPromotion: false }), []);
  });
});

describe("evaluateRefreshRules — ADS", () => {
  it("flags idle, paused and missing ads, but only when the ads API answered", () => {
    assert.ok(rules({ adsStatus: "idle" }).includes("ads_missing"));
    assert.ok(rules({ adsStatus: "paused" }).includes("ads_missing"));
    assert.ok(rules({ adsStatus: null }).includes("ads_missing"));
    assert.ok(!rules({ adsStatus: null, adsAvailable: false }).includes("ads_missing"));
  });

  it("flags TACOS above the target, and spend without sales", () => {
    assert.ok(rules({ tacosPercent: 12 }).includes("tacos_above"));
    assert.ok(!rules({ tacosPercent: 9 }).includes("tacos_above"));
    assert.ok(rules({ tacosPercent: null, adsCost: 40 }).includes("tacos_above"));
    assert.ok(
      !rules(
        { tacosPercent: 12 },
        { target: { minMarginPercent: null, tacosTargetPercent: 15 } },
      ).includes("tacos_above"),
    );
  });
});

describe("evaluateRefreshRules — margem e PMA", () => {
  it("decides by the margin after ADS", () => {
    assert.ok(rules({ marginPercent: 5, marginAfterAdsPercent: 1 }).includes("margin_below_min"));
    assert.ok(!rules({ marginPercent: 5, marginAfterAdsPercent: 3 }).includes("margin_below_min"));
  });

  it("falls back to MC when ADS cannot be discounted", () => {
    const unavailable = marginForRules(
      listing({ adsAvailable: false, marginPercent: 1.5, marginAfterAdsPercent: null }),
    );
    assert.equal(unavailable.basis, "contribution");
    assert.equal(unavailable.fallback, "ads_unavailable");
    assert.equal(unavailable.percent, 1.5);

    const spendWithoutSales = marginForRules(
      listing({ tacosPercent: null, adsCost: 30, marginPercent: 9, marginAfterAdsPercent: 9 }),
    );
    assert.equal(spendWithoutSales.fallback, "spend_without_sales");
  });

  it("ignores listings without cost (they go to 'faltam dados')", () => {
    assert.ok(
      !rules({ exclusionReason: "missing_cost", marginAfterAdsPercent: -40 }).includes(
        "margin_below_min",
      ),
    );
  });

  it("uses the catalog minimum for catalog listings", () => {
    const s = settings({ catalogMinMarginPercent: 5 });
    assert.ok(
      rules({ catalogListing: true, marginAfterAdsPercent: 4 }, { settings: s }).includes(
        "margin_below_min",
      ),
    );
  });

  it("flags price below the PMA", () => {
    assert.ok(rules({ pmaPrice: 110 }).includes("below_pma"));
    assert.ok(!rules({ pmaPrice: 100 }).includes("below_pma"));
  });

  it("drops disabled rules", () => {
    const hits = rules(
      { hasPromotion: false, adsStatus: "idle" },
      { settings: settings({ disabledRules: ["promo_missing"] }) },
    );
    assert.ok(!hits.includes("promo_missing"));
    assert.ok(hits.includes("ads_missing"));
  });
});

describe("evaluateCatalogRules", () => {
  it("maps live catalog status to rules, only for active listings", () => {
    assert.deepEqual(evaluateCatalogRules(catalogLive(), settings()), ["catalog_losing"]);
    assert.deepEqual(
      evaluateCatalogRules(catalogLive({ status: "shared" }), settings()),
      ["catalog_shared"],
    );
    assert.deepEqual(evaluateCatalogRules(catalogLive({ status: "winning" }), settings()), []);
    assert.deepEqual(evaluateCatalogRules(catalogLive({ mlStatus: "paused" }), settings()), []);
    assert.deepEqual(evaluateCatalogRules(null, settings()), []);
  });
});
