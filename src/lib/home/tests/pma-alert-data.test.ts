import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPmaAlertRows } from "@/lib/home/pma-alert-data";
import type { ItemBody } from "@/lib/mercadolibre/types";

function item(overrides: Partial<ItemBody> = {}): ItemBody {
  return {
    id: "MLB1",
    title: "Produto A",
    price: 100,
    currency_id: "BRL",
    available_quantity: 1,
    sold_quantity: 0,
    status: "active",
    seller_custom_field: "SKU-A",
    ...overrides,
  } as ItemBody;
}

describe("buildPmaAlertRows", () => {
  it("includes an item priced below its PMA", () => {
    const rows = buildPmaAlertRows(
      new Map([["SKU-A", 100]]),
      [item({ id: "MLB1", price: 80, seller_custom_field: "SKU-A" })],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mlItemId, "MLB1");
    assert.equal(rows[0].pmaPrice, 100);
    assert.equal(rows[0].currentPrice, 80);
    assert.equal(rows[0].shortfallPercent, 20);
  });

  it("excludes an item priced at or above its PMA", () => {
    const atPma = buildPmaAlertRows(
      new Map([["SKU-A", 100]]),
      [item({ id: "MLB1", price: 100, seller_custom_field: "SKU-A" })],
    );
    const abovePma = buildPmaAlertRows(
      new Map([["SKU-A", 80]]),
      [item({ id: "MLB1", price: 100, seller_custom_field: "SKU-A" })],
    );
    assert.equal(atPma.length, 0);
    assert.equal(abovePma.length, 0);
  });

  it("ignores items whose SKU has no PMA registered", () => {
    const rows = buildPmaAlertRows(
      new Map([["SKU-A", 100]]),
      [item({ id: "MLB1", price: 80, seller_custom_field: "SKU-B" })],
    );
    assert.equal(rows.length, 0);
  });

  it("ignores paused/non-active items even if priced below PMA", () => {
    const rows = buildPmaAlertRows(
      new Map([["SKU-A", 100]]),
      [
        item({
          id: "MLB1",
          price: 80,
          seller_custom_field: "SKU-A",
          status: "paused",
        }),
      ],
    );
    assert.equal(rows.length, 0);
  });

  it("includes 'own' (non-catalog) listings, not just catalog ones", () => {
    const rows = buildPmaAlertRows(
      new Map([["SKU-A", 100]]),
      [
        item({
          id: "MLB1",
          price: 80,
          seller_custom_field: "SKU-A",
          catalog_listing: false,
        }),
      ],
    );
    assert.equal(rows.length, 1);
  });

  it("sorts worst offenders first", () => {
    const rows = buildPmaAlertRows(
      new Map([
        ["SKU-A", 100],
        ["SKU-B", 100],
      ]),
      [
        item({ id: "MLB1", price: 90, seller_custom_field: "SKU-A" }),
        item({ id: "MLB2", price: 50, seller_custom_field: "SKU-B" }),
      ],
    );
    assert.deepEqual(
      rows.map((r) => r.mlItemId),
      ["MLB2", "MLB1"],
    );
  });
});
