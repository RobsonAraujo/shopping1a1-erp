import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFloorView, catalogVerdict } from "@/lib/rotina/floor-view";
import { detectNewCatalogLinks, resolveCatalogLinks } from "@/lib/rotina/links";
import { startOfLocalDay, startOfLocalDayPlus } from "@/lib/rotina/time";
import { NOW, TZ, listing } from "./fixtures";

describe("buildFloorView", () => {
  it("uses the after-ADS floor and computes the max promo discount", () => {
    const floor = buildFloorView(listing({ regularPrice: 120, floorAfterAdsPrice: 84 }), 2);
    assert.equal(floor.effectivePrice, 84);
    assert.equal(floor.boundBy, "margin");
    assert.equal(floor.maxDiscountPercent, 30);
    assert.equal(floor.stale, false);
  });

  it("falls back to the MC floor without an after-ADS one", () => {
    const floor = buildFloorView(
      listing({ floorAfterAdsPrice: null, adsAvailable: false }),
      2,
    );
    assert.equal(floor.effectivePrice, 80);
    assert.equal(floor.afterAdsMissing, "ads_unavailable");
  });

  it("treats the PMA as a hard floor", () => {
    const floor = buildFloorView(listing({ pmaPrice: 95 }), 2);
    assert.equal(floor.effectivePrice, 95);
    assert.equal(floor.boundBy, "pma");
  });

  it("moves a PMA that falls inside a forbidden band to the end of the band", () => {
    const floor = buildFloorView(
      listing({
        floorAfterAdsPrice: 55,
        pmaPrice: 80,
        floorBands: [{ from: 79, to: 82.19 }],
      }),
      2,
    );
    assert.equal(floor.effectivePrice, 82.2);
    assert.deepEqual(floor.bands, []);
  });

  it("marks floors computed with another target as stale", () => {
    assert.equal(buildFloorView(listing({ floorTargetPercent: 2 }), 5).stale, true);
    assert.equal(buildFloorView(listing({ floorTargetPercent: null }), 2).stale, true);
  });
});

describe("catalogVerdict", () => {
  const floor = buildFloorView(listing({ floorAfterAdsPrice: 90 }), 2);

  it("says how much is left over when winning keeps the minimum", () => {
    assert.deepEqual(catalogVerdict(floor, 94.9), {
      kind: "can_win",
      suggestedPrice: 94.9,
      slack: 4.9,
      belowBand: false,
    });
  });

  it("says it doesn't pay off when the price to win is below the minimum", () => {
    assert.deepEqual(catalogVerdict(floor, 85), { kind: "cannot_win", shortfall: 5 });
  });

  it("suggests pricing just below a forbidden band", () => {
    const banded = buildFloorView(
      listing({ floorAfterAdsPrice: 55, floorBands: [{ from: 79, to: 82.19 }] }),
      2,
    );
    assert.deepEqual(catalogVerdict(banded, 80), {
      kind: "can_win",
      suggestedPrice: 78.99,
      slack: 23.99,
      belowBand: true,
    });
  });

  it("is unknown without a price to win", () => {
    assert.deepEqual(catalogVerdict(floor, null), { kind: "unknown" });
  });
});

describe("resolveCatalogLinks", () => {
  const own = (id: string, extra: Partial<Parameters<typeof resolveCatalogLinks>[0][number]> = {}) => ({
    mlItemId: id,
    catalogListing: false,
    sku: null,
    catalogProductId: null,
    relatedItemIds: [],
    ...extra,
  });
  const cat = (id: string, extra: Partial<Parameters<typeof resolveCatalogLinks>[0][number]> = {}) => ({
    ...own(id, extra),
    catalogListing: true,
  });

  it("prefers item_relations, then catalog product, then a unique SKU", () => {
    const links = resolveCatalogLinks([
      own("OWN1", { sku: "A" }),
      own("OWN2", { catalogProductId: "MLBP2", sku: "B" }),
      own("OWN3", { sku: "C" }),
      cat("CAT1", { relatedItemIds: ["OWN1"], sku: "C" }),
      cat("CAT2", { catalogProductId: "MLBP2" }),
      cat("CAT3", { sku: " c " }),
    ]);
    assert.equal(links.get("CAT1"), "OWN1");
    assert.equal(links.get("CAT2"), "OWN2");
    assert.equal(links.get("CAT3"), "OWN3");
  });

  it("does not link by an ambiguous SKU", () => {
    const links = resolveCatalogLinks([
      own("OWN1", { sku: "A" }),
      own("OWN2", { sku: "A" }),
      cat("CAT1", { sku: "A" }),
    ]);
    assert.equal(links.has("CAT1"), false);
  });

  it("also follows relations declared on the own listing", () => {
    const links = resolveCatalogLinks([own("OWN1", { relatedItemIds: ["CAT1"] }), cat("CAT1")]);
    assert.equal(links.get("CAT1"), "OWN1");
  });
});

describe("detectNewCatalogLinks", () => {
  it("reports only links that changed and catalogs created recently", () => {
    const fresh = detectNewCatalogLinks({
      links: new Map([
        ["CAT1", "OWN1"],
        ["CAT2", "OWN2"],
        ["CAT3", "OWN3"],
        ["CAT4", "OWN4"],
      ]),
      previousLinkByCatalogId: new Map([
        ["CAT1", "OWN1"],
        ["CAT2", null],
      ]),
      listedAtByCatalogId: new Map([
        ["CAT2", "2026-11-08T12:00:00.000Z"],
        ["CAT3", "2025-01-01T12:00:00.000Z"],
        ["CAT4", null],
      ]),
      now: NOW,
      maxAgeDays: 30,
    });
    assert.deepEqual(fresh, [
      { catalogItemId: "CAT2", ownItemId: "OWN2" },
      { catalogItemId: "CAT4", ownItemId: "OWN4" },
    ]);
  });
});

describe("time helpers", () => {
  it("finds local midnight in São Paulo", () => {
    assert.equal(startOfLocalDay(NOW, TZ).toISOString(), "2026-11-10T03:00:00.000Z");
    assert.equal(
      startOfLocalDay(new Date("2026-11-11T02:30:00.000Z"), TZ).toISOString(),
      "2026-11-10T03:00:00.000Z",
      "23h30 local is still the 10th",
    );
    assert.equal(startOfLocalDayPlus(NOW, 1, TZ).toISOString(), "2026-11-11T03:00:00.000Z");
  });
});
