import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSellerListingStartedLabel } from "../listing-dates";

describe("formatSellerListingStartedLabel", () => {
  it("returns null when date_created is missing", () => {
    assert.equal(
      formatSellerListingStartedLabel({ date_created: undefined, catalog_listing: false }),
      null,
    );
  });

  it("returns null for an invalid date string", () => {
    assert.equal(
      formatSellerListingStartedLabel({ date_created: "not-a-date", catalog_listing: false }),
      null,
    );
  });

  it("labels non-catalog listings as 'Anúncio criado em'", () => {
    const result = formatSellerListingStartedLabel({
      date_created: new Date().toISOString(),
      catalog_listing: false,
    });
    assert.ok(result);
    assert.match(result.label, /^Anúncio criado em/);
    assert.match(result.label, /\(hoje\)/);
  });

  it("labels catalog listings as 'Você entrou no catálogo em'", () => {
    const result = formatSellerListingStartedLabel({
      date_created: new Date().toISOString(),
      catalog_listing: true,
    });
    assert.ok(result);
    assert.match(result.label, /^Você entrou no catálogo em/);
    assert.match(result.hint, /catálogo/);
  });

  it("shows singular '1 dia atrás' for yesterday", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = formatSellerListingStartedLabel({
      date_created: yesterday,
      catalog_listing: false,
    });
    assert.ok(result);
    assert.match(result.label, /\(1 dia atrás\)/);
  });

  it("shows plural 'N dias atrás' for older dates", () => {
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = formatSellerListingStartedLabel({
      date_created: tenDaysAgo,
      catalog_listing: false,
    });
    assert.ok(result);
    assert.match(result.label, /\(10 dias atrás\)/);
  });
});
