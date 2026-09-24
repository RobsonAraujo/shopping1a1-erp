import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planSkuUpdates, type SkuSyncUpdate } from "../product-sku-sync";

function current(entries: [string, string | null][]): Map<string, string | null> {
  return new Map(entries);
}

describe("planSkuUpdates", () => {
  it("applies an update whose SKU nobody else owns", () => {
    const updates: SkuSyncUpdate[] = [
      { mlItemId: "MLB1", from: "ANTIGO", to: "NOVO" },
    ];
    const { applied, skippedDuplicate } = planSkuUpdates(
      current([
        ["MLB1", "ANTIGO"],
        ["MLB2", "OUTRO"],
      ]),
      updates,
    );
    assert.deepEqual(applied, updates);
    assert.deepEqual(skippedDuplicate, []);
  });

  it("refuses an update that would duplicate another product's SKU", () => {
    // Caso do dealer que usa o mesmo seller_custom_field no anúncio de
    // catálogo e no próprio: sem isto, os dois colapsam no mesmo texto.
    const { applied, skippedDuplicate } = planSkuUpdates(
      current([
        ["MLB_CATALOGO", "CABO 5m (Catálogo)"],
        ["MLB_PROPRIO", "CABO 5m (Próprio)"],
      ]),
      [{ mlItemId: "MLB_PROPRIO", from: "CABO 5m (Próprio)", to: "CABO 5m (Catálogo)" }],
    );
    assert.deepEqual(applied, []);
    assert.deepEqual(skippedDuplicate, [
      {
        mlItemId: "MLB_PROPRIO",
        sku: "CABO 5m (Catálogo)",
        conflictsWith: "MLB_CATALOGO",
      },
    ]);
  });

  it("refuses the second of two updates converging on the same SKU", () => {
    const { applied, skippedDuplicate } = planSkuUpdates(
      current([
        ["MLB1", "A"],
        ["MLB2", "B"],
      ]),
      [
        { mlItemId: "MLB1", from: "A", to: "MESMO" },
        { mlItemId: "MLB2", from: "B", to: "MESMO" },
      ],
    );
    assert.deepEqual(applied, [{ mlItemId: "MLB1", from: "A", to: "MESMO" }]);
    assert.equal(skippedDuplicate.length, 1);
    assert.equal(skippedDuplicate[0].mlItemId, "MLB2");
    assert.equal(skippedDuplicate[0].conflictsWith, "MLB1");
  });

  it("lets a product take the SKU freed by an earlier update in the batch", () => {
    // MLB1 larga "A" ao virar "C", então MLB2 pode assumir "A".
    const { applied, skippedDuplicate } = planSkuUpdates(
      current([
        ["MLB1", "A"],
        ["MLB2", "B"],
      ]),
      [
        { mlItemId: "MLB1", from: "A", to: "C" },
        { mlItemId: "MLB2", from: "B", to: "A" },
      ],
    );
    assert.equal(applied.length, 2);
    assert.deepEqual(skippedDuplicate, []);
  });

  it("does not touch SKU duplicates that already exist", () => {
    // Dois produtos já compartilham "REPETIDO" — não é papel do sync arrumar
    // isso, só não piorar. Uma atualização não relacionada segue normalmente.
    const { applied, skippedDuplicate } = planSkuUpdates(
      current([
        ["MLB1", "REPETIDO"],
        ["MLB2", "REPETIDO"],
        ["MLB3", "ANTIGO"],
      ]),
      [{ mlItemId: "MLB3", from: "ANTIGO", to: "NOVO" }],
    );
    assert.equal(applied.length, 1);
    assert.deepEqual(skippedDuplicate, []);
  });

  it("allows a product to keep its own SKU text", () => {
    // Re-gravar o mesmo texto no mesmo produto não é colisão consigo mesmo.
    const { applied, skippedDuplicate } = planSkuUpdates(
      current([["MLB1", "  CABO   5m "]]),
      [{ mlItemId: "MLB1", from: "  CABO   5m ", to: "CABO 5m" }],
    );
    assert.equal(applied.length, 1);
    assert.deepEqual(skippedDuplicate, []);
  });

  it("ignores products with no SKU when checking ownership", () => {
    const { applied, skippedDuplicate } = planSkuUpdates(
      current([
        ["MLB1", null],
        ["MLB2", ""],
        ["MLB3", "ANTIGO"],
      ]),
      [{ mlItemId: "MLB3", from: "ANTIGO", to: "NOVO" }],
    );
    assert.equal(applied.length, 1);
    assert.deepEqual(skippedDuplicate, []);
  });
});
