import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRotinaView, type RotinaViewInput } from "@/lib/rotina/view";
import {
  applyActionOverrides,
  groupActiveByRule,
  summarizeActions,
} from "@/lib/rotina/view-summary";
import { NOW, TZ, catalogLive, listing, settings, state } from "./fixtures";

function input(overrides: Partial<RotinaViewInput> = {}): RotinaViewInput {
  return {
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: [],
    catalogLive: [],
    targets: new Map(),
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
    ...overrides,
  };
}

const ownNoPromo = listing({
  mlItemId: "OWN1",
  title: "Kit Escova",
  hasPromotion: false,
  regularPrice: null,
  salePrice: 129.9,
  floorAfterAdsPrice: 104.5,
  floorMcPrice: 99.8,
});
const ownNoAds = listing({ mlItemId: "OWN2", title: "Mouse W", adsStatus: "idle" });
const catalogRow = listing({
  mlItemId: "CAT1",
  title: "Fone X catálogo",
  catalogListing: true,
  floorAfterAdsPrice: 91.2,
  floorMcPrice: 88.7,
  linkedOwnItemId: "OWN1",
  listedAt: "2026-11-08T12:00:00.000Z",
});

describe("buildRotinaView", () => {
  it("builds the day's actions with floor and catalog verdict", () => {
    const view = buildRotinaView(
      input({
        health: [ownNoPromo, ownNoAds, catalogRow],
        catalogLive: [catalogLive({ mlItemId: "CAT1", priceToWin: 94.9 })],
      }),
    );

    const promo = view.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.ok(promo);
    assert.equal(promo.segment, "own");
    assert.equal(promo.floor?.effectivePrice, 104.5);
    assert.equal(promo.floor?.maxDiscountPercent, 19);

    const losing = view.actions.find((action) => action.id === "catalog_losing:CAT1");
    assert.ok(losing);
    assert.equal(losing.segment, "catalog");
    assert.equal(losing.isNew, true, "started losing today");
    assert.match(losing.headline, /desde hoje às 10h05/);
    assert.equal(losing.verdict?.tone, "ok");
    assert.match(losing.verdict?.text ?? "", /sobra R\$\s?3,70/);

    assert.ok(view.actions.some((action) => action.id === "ads_missing:OWN2"));
    assert.equal(view.dataIsFromToday, true);
    assert.equal(view.info.linkedCatalog.length, 1);
    assert.equal(view.info.linkedCatalog[0].own.mlItemId, "OWN1");
  });

  it("orders groups by urgency and keeps new items first", () => {
    const view = buildRotinaView(
      input({
        health: [ownNoPromo, ownNoAds, catalogRow],
        catalogLive: [catalogLive({ mlItemId: "CAT1" })],
      }),
    );
    const groups = groupActiveByRule(view.actions, "all").map((group) => group.rule);
    assert.deepEqual(groups, ["catalog_losing", "ads_missing", "promo_missing"]);
    assert.deepEqual(
      groupActiveByRule(view.actions, "own").map((group) => group.rule),
      ["ads_missing", "promo_missing"],
    );
  });

  it("hides done actions and brings them back as 'continues' after newer data", () => {
    const doneEarlier = state({
      mlItemId: "OWN1",
      rule: "promo_missing",
      status: "done",
      statusChangedAt: "2026-11-10T08:00:00.000Z",
    });
    const fresh = buildRotinaView(input({ health: [ownNoPromo], states: [doneEarlier] }));
    const promo = fresh.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.equal(promo?.bucket, "active");
    assert.equal(promo?.continues, true, "the 09h refresh still saw no promotion");

    const doneLater = { ...doneEarlier, statusChangedAt: "2026-11-10T14:00:00.000Z" };
    const hidden = buildRotinaView(input({ health: [ownNoPromo], states: [doneLater] }));
    const hiddenPromo = hidden.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.equal(hiddenPromo?.bucket, "done");
    assert.equal(hiddenPromo?.doneToday, true);
  });

  it("shows a catalog takeover event on the own listing until acknowledged", () => {
    const event = state({
      mlItemId: "CAT1",
      rule: "catalog_takeover",
      status: "open",
      firstSeenAt: "2026-11-10T09:00:00.000Z",
      relatedItemId: "OWN1",
    });
    const view = buildRotinaView(input({ health: [ownNoPromo, catalogRow], states: [event] }));
    const takeover = view.actions.find((action) => action.rule === "catalog_takeover");
    assert.ok(takeover);
    assert.equal(takeover.listing.mlItemId, "OWN1");
    assert.equal(takeover.related?.mlItemId, "CAT1");
    assert.equal(takeover.segment, "own");
    assert.equal(takeover.isNew, true);
    assert.match(takeover.headline, /CAT1 em 08\/11/);

    const acked = buildRotinaView(
      input({ health: [ownNoPromo, catalogRow], states: [{ ...event, status: "done" }] }),
    );
    assert.equal(
      acked.actions.find((action) => action.rule === "catalog_takeover")?.bucket,
      "done",
    );
  });

  it("reflects a new target immediately and flags the stale floor", () => {
    const view = buildRotinaView(
      input({
        health: [listing({ mlItemId: "OWN3", marginAfterAdsPercent: 4, floorTargetPercent: 2 })],
        targets: new Map([["OWN3", { minMarginPercent: 6, tacosTargetPercent: null }]]),
      }),
    );
    const margin = view.actions.find((action) => action.id === "margin_below_min:OWN3");
    assert.ok(margin, "4% after ADS is below the listing's 6%");
    assert.equal(margin.listing.minMarginOverridden, true);
    assert.equal(margin.floor?.stale, true);
    assert.ok(view.warnings.some((warning) => warning.includes("outra meta")));
  });

  it("lists missing data, eligibility risk and today's resolutions", () => {
    const view = buildRotinaView(
      input({
        health: [
          listing({ mlItemId: "OWN4", exclusionReason: "missing_cost" }),
          listing({ mlItemId: "OWN5", tags: ["catalog_listing_eligible"] }),
        ],
        catalogLive: [catalogLive({ mlItemId: "CAT7", status: "winning", wonBackToday: true })],
        states: [
          state({
            mlItemId: "OWN5",
            rule: "promo_missing",
            status: "resolved",
            resolvedAt: "2026-11-10T09:00:00.000Z",
          }),
        ],
      }),
    );
    assert.deepEqual(
      view.info.dataMissing.map((item) => [item.mlItemId, item.note]),
      [["OWN4", "Sem custo"]],
    );
    assert.deepEqual(view.info.catalogEligible.map((item) => item.mlItemId), ["OWN5"]);
    assert.deepEqual(
      view.info.resolvedToday.map((item) => item.mlItemId).sort(),
      ["CAT7", "OWN5"],
    );
  });

  it("works for catalog listings before the first refresh", () => {
    const view = buildRotinaView(
      input({ catalogLive: [catalogLive({ mlItemId: "CAT8" })], lastCompleteRunAt: null }),
    );
    const losing = view.actions.find((action) => action.id === "catalog_losing:CAT8");
    assert.ok(losing);
    assert.equal(losing.listing.hasHealth, false);
    assert.equal(losing.verdict?.tone, "neutral");
    assert.equal(view.hasHealth, false);
    assert.equal(view.dataIsFromToday, false);
  });
});

describe("view summary", () => {
  it("counts per segment and applies optimistic overrides", () => {
    const view = buildRotinaView(
      input({
        health: [ownNoPromo, ownNoAds, catalogRow],
        catalogLive: [catalogLive({ mlItemId: "CAT1" })],
      }),
    );
    const before = summarizeActions(view.actions);
    assert.equal(before.active, 3);
    assert.equal(before.bySegment.own, 2);
    assert.equal(before.bySegment.catalog, 1);
    assert.equal(before.newToday, 1);

    const after = summarizeActions(
      applyActionOverrides(
        view.actions,
        new Map([["ads_missing:OWN2", { bucket: "done" as const, doneToday: true }]]),
      ),
    );
    assert.equal(after.active, 2);
    assert.equal(after.doneToday, 1);
  });
});
