import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeListingParam,
  toCalculatorListings,
  type CalculatorKnownListing,
} from "@/lib/rotina/calculator-listings";
import { simulatorSetupForListing } from "@/lib/rotina/simulator-suggestions";
import { buildRotinaView } from "@/lib/rotina/view";
import { NOW, TZ, catalogLive, listing, settings } from "@/lib/rotina/__tests__/fixtures";

function rows() {
  return buildRotinaView({
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: [
      // Mais impacto (vendas/dia × preço) primeiro.
      listing({ mlItemId: "MLB2", title: "Mouse W", unitsPerDay: 1, salePrice: 50 }),
      listing({ mlItemId: "MLB1", title: "Kit Escova", unitsPerDay: 5, salePrice: 100 }),
      listing({
        mlItemId: "MLB9",
        title: "Fone X (catálogo)",
        catalogListing: true,
        salePrice: 99.9,
        marginAfterAdsPercent: 1,
        unitsPerDay: 3,
      }),
    ],
    catalogLive: [catalogLive({ mlItemId: "MLB9", status: "losing", priceToWin: 94.9 })],
    targets: new Map([["MLB2", { minMarginPercent: 5, tacosTargetPercent: null }]]),
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
  }).listings;
}

/** Meta padrão do segmento (como `effectiveMinMarginPercent` sem meta própria). */
const defaults = (catalogListing: boolean) => (catalogListing ? 1 : 3);

function known(overrides: Partial<CalculatorKnownListing>): CalculatorKnownListing {
  return {
    mlItemId: "MLB50",
    titleSnapshot: "Novo anúncio",
    skuSnapshot: "NOVO",
    imageUrlSnapshot: null,
    catalogListing: false,
    mlStatus: "active",
    ...overrides,
  };
}

describe("toCalculatorListings", () => {
  it("keeps the Central's impact order, then unread listings by title, without repeats", () => {
    const result = toCalculatorListings(rows(), [
      known({ mlItemId: "MLB1", titleSnapshot: "Kit Escova (Listing)" }),
      known({ mlItemId: "MLB61", titleSnapshot: "Zíper" }),
      known({ mlItemId: "MLB60", titleSnapshot: "Abraçadeira" }),
    ], defaults);
    assert.deepEqual(
      result.map((entry) => entry.mlItemId),
      ["MLB1", "MLB9", "MLB2", "MLB60", "MLB61"],
    );
    // A linha lida vence a do `Listing`.
    assert.equal(result[0].title, "Kit Escova");
  });

  it("brings today's numbers and the same shortcuts as the Anúncios tab", () => {
    const source = rows();
    const result = toCalculatorListings(source, [], defaults);
    for (const row of source) {
      const entry = result.find((candidate) => candidate.mlItemId === row.mlItemId);
      assert.ok(entry?.today);
      assert.deepEqual(entry.suggestions, simulatorSetupForListing(row).suggestions);
      // O campo abre no preço de hoje: nada roda sozinho na Calculadora.
      assert.equal(entry.defaultPrice, row.salePrice);
    }

    const catalog = result.find((entry) => entry.mlItemId === "MLB9");
    assert.equal(catalog?.today?.catalogStatus, "losing");
    assert.equal(catalog?.today?.priceToWin, 94.9);
    assert.ok(catalog?.suggestions.some((entry) => entry.label === "Preço p/ ganhar"));

    // Margem que decide = após ADS, colorida pela meta (1% < 2%).
    assert.equal(catalog?.today?.decidingBasis, "afterAds");
    assert.equal(catalog?.today?.meetsTarget, false);

    // A calculadora abre na meta que já vale: a própria, ou a do segmento.
    const ownTarget = result.find((entry) => entry.mlItemId === "MLB2");
    assert.equal(ownTarget?.targetPercent, 5);
    assert.equal(ownTarget?.ownTarget, true);
    assert.equal(ownTarget?.today?.targetPercent, 5);
    const segmentTarget = result.find((entry) => entry.mlItemId === "MLB1");
    assert.equal(segmentTarget?.targetPercent, 2);
    assert.equal(segmentTarget?.ownTarget, false);
  });

  it("marks listings without a Central reading: no shortcuts, today's price comes from the server", () => {
    const [entry, catalog] = toCalculatorListings(
      [],
      [
        known({ mlItemId: "MLB70", titleSnapshot: null, catalogListing: null }),
        known({ mlItemId: "MLB71", titleSnapshot: "Z catálogo", catalogListing: true }),
      ],
      defaults,
    );
    // Sem leitura: a meta padrão do segmento.
    assert.equal(entry.targetPercent, 3);
    assert.equal(catalog.targetPercent, 1);
    assert.equal(entry.today, null);
    assert.deepEqual(entry.suggestions, []);
    assert.equal(entry.defaultPrice, null);
    assert.equal(entry.title, "MLB70");
    assert.equal(entry.catalogListing, false);
    assert.match(entry.permalink, /^https:\/\/produto\.mercadolivre\.com\.br\/mlb-70$/);
  });
});

describe("normalizeListingParam", () => {
  it("reads the URL the same way on server and client", () => {
    assert.equal(normalizeListingParam(" mlb123 "), "MLB123");
    assert.equal(normalizeListingParam(""), null);
    assert.equal(normalizeListingParam(null), null);
  });
});
