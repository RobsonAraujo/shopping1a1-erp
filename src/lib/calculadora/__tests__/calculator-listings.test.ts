import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeListingParam,
  toCalculatorListings,
  type CalculatorKnownListing,
} from "@/lib/calculadora/calculator-listings";

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
  it("lists by title, without repeats", () => {
    const result = toCalculatorListings([
      known({ mlItemId: "MLB61", titleSnapshot: "Zíper" }),
      known({ mlItemId: "MLB60", titleSnapshot: "Abraçadeira" }),
      known({ mlItemId: "MLB62", titleSnapshot: "Escova" }),
      known({ mlItemId: "MLB60", titleSnapshot: "Abraçadeira (de novo)" }),
    ]);
    assert.deepEqual(
      result.map((entry) => entry.mlItemId),
      ["MLB60", "MLB62", "MLB61"],
    );
    // A primeira fonte vence.
    assert.equal(result[0].title, "Abraçadeira");
  });

  it("fills the first source's empty fields from the next one", () => {
    const [entry] = toCalculatorListings([
      known({ mlItemId: "MLB70", titleSnapshot: null, skuSnapshot: null, catalogListing: null }),
      known({ mlItemId: "MLB70", titleSnapshot: "Lanterna", skuSnapshot: "LANT", catalogListing: true }),
    ]);
    assert.equal(entry.title, "Lanterna");
    assert.equal(entry.sku, "LANT");
    assert.equal(entry.catalogListing, true);
  });

  it("falls back to the MLB as title and links to the buyer page", () => {
    const [entry] = toCalculatorListings([
      known({ mlItemId: "MLB70", titleSnapshot: null, catalogListing: null }),
    ]);
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
