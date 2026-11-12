import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogRaiseQualifies,
  estimateCatalogRaise,
} from "@/lib/rotina/catalog-raise";
import { resolveRecentRaise } from "@/lib/rotina/catalog-history";
import { NOW, competition } from "./fixtures";

const HOURS = 60 * 60 * 1000;

function estimate(overrides: Partial<Parameters<typeof estimateCatalogRaise>[0]> = {}) {
  return estimateCatalogRaise({
    status: "winning",
    sellerPrice: 40,
    competition: competition(),
    now: NOW,
    cushionPercent: 3,
    maxAgeMs: 3 * HOURS,
    ...overrides,
  });
}

describe("estimateCatalogRaise", () => {
  it("win ceiling = cheapest × (1 − cushion), share ≈ cheapest", () => {
    const raise = estimate();
    assert.ok(raise);
    assert.equal(raise.alone, false);
    assert.equal(raise.cheapest?.price, 45);
    assert.equal(raise.cheapestLogisticLabel, "Flex");
    assert.equal(raise.winCeiling, 43.65);
    assert.equal(raise.shareCeiling, 45);
    assert.equal(raise.gainPerUnit, 3.65);
    assert.equal(raise.gainPercent, 9.13);
    assert.equal(raise.belowBand, false);
    // Você é Full; o mais barato é Flex: nada de aviso.
    assert.equal(raise.betterLogistics, null);
  });

  it("rounds the ceiling down to the cent", () => {
    const raise = estimate({
      competition: competition({
        top: [{ itemId: "C", sellerId: "1", price: 33.33, logisticType: null, freeShipping: null }],
      }),
    });
    // 33,33 × 0,97 = 32,3301 → 32,33
    assert.equal(raise?.winCeiling, 32.33);
  });

  it("stays just below a known band where shipping becomes yours", () => {
    const raise = estimate({ bands: [{ from: 43, to: 47 }] });
    assert.equal(raise?.winCeiling, 42.99);
    assert.equal(raise?.belowBand, true);
  });

  it("warns when a competitor near the cheapest has better delivery than yours", () => {
    const raise = estimate({
      competition: competition({ myLogisticType: "cross_docking" }),
    });
    // Mais barato é Flex (melhor que Coleta).
    assert.deepEqual(raise?.betterLogistics, { price: 45, label: "Flex" });
    // Sem saber a sua logística, não acusa ninguém de entregar melhor.
    assert.equal(
      estimate({ competition: competition({ myLogisticType: null }) })?.betterLogistics,
      null,
    );
  });

  it("flags your own other listing priced between today and the ceiling", () => {
    const own = (price: number) =>
      competition({ ownOfferCount: 2, ownOther: { itemId: "MLB-IRMAO", price, logisticType: "fulfillment" } });
    // Hoje 40, teto 43,65: o irmão a 41,50 vira o teto prático.
    assert.deepEqual(estimate({ competition: own(41.5) })?.ownOther, { itemId: "MLB-IRMAO", price: 41.5 });
    // Acima do teto ou abaixo do preço de hoje: não atrapalha a alta.
    assert.equal(estimate({ competition: own(44) })?.ownOther, null);
    assert.equal(estimate({ competition: own(39) })?.ownOther, null);
    // Sozinho no produto, mas com o irmão: avisa também.
    assert.deepEqual(
      estimate({ competition: { ...own(48), competitorCount: 0, top: [] } })?.ownOther,
      { itemId: "MLB-IRMAO", price: 48 },
    );
  });

  it("alone in the product: no ceiling", () => {
    const raise = estimate({ competition: competition({ competitorCount: 0, top: [] }) });
    assert.equal(raise?.alone, true);
    assert.equal(raise?.winCeiling, null);
    assert.equal(catalogRaiseQualifies(raise, 2), true);
  });

  it("nothing outside winning, without price, or with stale competition", () => {
    assert.equal(estimate({ status: "shared" }), null);
    assert.equal(estimate({ status: "losing" }), null);
    assert.equal(estimate({ sellerPrice: null }), null);
    assert.equal(estimate({ competition: null }), null);
    assert.equal(
      estimate({ competition: competition({ fetchedAt: "2026-11-10T11:00:00.000Z" }) }),
      null,
    );
  });
});

describe("catalogRaiseQualifies", () => {
  it("needs a positive gain at or above the minimum %", () => {
    assert.equal(catalogRaiseQualifies(estimate(), 2), true);
    assert.equal(catalogRaiseQualifies(estimate(), 10), false);
    // Mais barato a R$ 41: teto 39,77, abaixo de hoje.
    const below = estimate({
      competition: competition({
        top: [{ itemId: "C", sellerId: "1", price: 41, logisticType: null, freeShipping: null }],
      }),
    });
    assert.equal(below?.gainPerUnit, -0.23);
    assert.equal(catalogRaiseQualifies(below, 0), false);
    assert.equal(catalogRaiseQualifies(null, 0), false);
  });
});

describe("resolveRecentRaise", () => {
  it("finds the last price increase made while winning", () => {
    const raise = resolveRecentRaise([
      { status: "winning", snapshotAt: "2026-11-08T10:00:00.000Z", sellerPrice: 40 },
      { status: "winning", snapshotAt: "2026-11-09T10:00:00.000Z", sellerPrice: 45 },
      { status: "losing", snapshotAt: "2026-11-09T11:00:00.000Z", sellerPrice: 45 },
    ]);
    assert.deepEqual(raise, { from: 40, to: 45, at: "2026-11-09T10:00:00.000Z" });
  });

  it("counts a raise that lost on the very next reading", () => {
    const raise = resolveRecentRaise([
      { status: "losing", snapshotAt: "2026-11-09T11:00:00.000Z", sellerPrice: 45 },
      { status: "winning", snapshotAt: "2026-11-08T10:00:00.000Z", sellerPrice: 40 },
    ]);
    assert.deepEqual(raise, { from: 40, to: 45, at: "2026-11-09T11:00:00.000Z" });
  });

  it("ignores increases that did not start from winning, and unknown points", () => {
    assert.equal(
      resolveRecentRaise([
        { status: "losing", snapshotAt: "2026-11-08T10:00:00.000Z", sellerPrice: 40 },
        { status: "losing", snapshotAt: "2026-11-09T10:00:00.000Z", sellerPrice: 45 },
      ]),
      null,
    );
    assert.equal(
      resolveRecentRaise([
        { status: "winning", snapshotAt: "2026-11-08T10:00:00.000Z", sellerPrice: 40 },
        { status: "unknown", snapshotAt: "2026-11-09T10:00:00.000Z", sellerPrice: 45 },
      ]),
      null,
    );
  });
});
