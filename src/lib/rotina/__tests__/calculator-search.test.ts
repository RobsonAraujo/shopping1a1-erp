import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCalculatorSearchIndex,
  foldSearchText,
  searchCalculatorIndex,
} from "@/lib/rotina/calculator-search";

type Row = { mlItemId: string; title: string; sku: string | null };

const ROWS: Row[] = [
  { mlItemId: "MLB111222333", title: "Parafuso Sextavado Kit 50", sku: "PAR-50" },
  { mlItemId: "MLB444555666", title: "Açúcar Cristal 5kg", sku: "ACU-5" },
  { mlItemId: "MLB777888999", title: "Kit Escova Dental", sku: "ESC-KIT" },
  { mlItemId: "MLB666", title: "Fone Bluetooth", sku: null },
];

const index = buildCalculatorSearchIndex(ROWS, (row) => row);
const ids = (query: string) => searchCalculatorIndex(index, query).map((row) => row.mlItemId);

describe("calculator search", () => {
  it("folds accents, case and spaces", () => {
    assert.equal(foldSearchText("  Açúcar   CRISTAL "), "acucar cristal");
  });

  it("returns everything, in index order, for an empty query", () => {
    assert.deepEqual(ids("   "), ROWS.map((row) => row.mlItemId));
  });

  it("matches title words in any order and without accents", () => {
    assert.deepEqual(ids("kit parafuso"), ["MLB111222333"]);
    assert.deepEqual(ids("acucar"), ["MLB444555666"]);
    assert.deepEqual(ids("kit"), ["MLB111222333", "MLB777888999"]);
  });

  it("accepts the MLB in any shape", () => {
    assert.deepEqual(ids("MLB444555666"), ["MLB444555666"]);
    assert.deepEqual(ids("mlb-444555666"), ["MLB444555666"]);
    assert.deepEqual(ids("MLB 444555666"), ["MLB444555666"]);
    assert.deepEqual(ids("444555666"), ["MLB444555666"]);
    assert.deepEqual(ids("555"), ["MLB444555666"]);
  });

  it("puts an exact SKU or MLB first, ahead of partial matches", () => {
    // "666" é o MLB666 inteiro e só um pedaço de MLB444555666.
    assert.deepEqual(ids("666"), ["MLB666", "MLB444555666"]);
    assert.deepEqual(ids("mlb666"), ["MLB666"]);
    assert.deepEqual(ids("esc-kit"), ["MLB777888999"]);
    const withSkuClash = buildCalculatorSearchIndex(
      [
        { mlItemId: "MLB1", title: "Kit ESC-KIT2 extra", sku: "ESC-KIT2" },
        { mlItemId: "MLB2", title: "Outro", sku: "ESC-KIT" },
      ],
      (row) => row,
    );
    assert.deepEqual(
      searchCalculatorIndex(withSkuClash, "ESC-KIT").map((row) => row.mlItemId),
      ["MLB2", "MLB1"],
    );
  });
});
