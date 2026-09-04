import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeItemListSearchQuery,
  matchesItemListSearch,
  filterByItemListSearch,
} from "../item-list-search";

describe("normalizeItemListSearchQuery", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeItemListSearchQuery("  MLB123  "), "mlb123");
  });
});

describe("matchesItemListSearch", () => {
  it("matches an empty/blank query against anything", () => {
    assert.equal(matchesItemListSearch("", { sku: "ABC" }), true);
    assert.equal(matchesItemListSearch("   ", { sku: "ABC" }), true);
  });

  it("matches case-insensitively across sku/title/mlItemId", () => {
    assert.equal(
      matchesItemListSearch("gorilla", { title: "Suporte Gorilla 3m" }),
      true,
    );
    assert.equal(matchesItemListSearch("mlb999", { mlItemId: "MLB999" }), true);
  });

  it("matches against extra fields", () => {
    assert.equal(
      matchesItemListSearch("fornecedor-x", {
        sku: "ABC",
        extra: ["Fornecedor-X"],
      }),
      true,
    );
  });

  it("ignores null/undefined fields without throwing", () => {
    assert.equal(
      matchesItemListSearch("abc", { sku: null, title: undefined, extra: [null, undefined] }),
      false,
    );
  });

  it("returns false when nothing matches", () => {
    assert.equal(matchesItemListSearch("zzz", { sku: "ABC", title: "Foo" }), false);
  });
});

describe("filterByItemListSearch", () => {
  const rows = [
    { sku: "MXT-1", title: "Aquário 20L" },
    { sku: "MXT-2", title: "Aquário 40L" },
    { sku: "ABC-1", title: "Filtro externo" },
  ];

  it("returns all items unchanged for a blank query", () => {
    assert.equal(filterByItemListSearch(rows, "", (r) => r).length, 3);
  });

  it("filters down to matching rows only", () => {
    const result = filterByItemListSearch(rows, "aquário", (r) => r);
    assert.equal(result.length, 2);
  });

  it("filters using the mapped fields, not the raw item shape", () => {
    const result = filterByItemListSearch(rows, "mxt", (r) => ({ sku: r.sku }));
    assert.equal(result.length, 2);
  });

  it("returns an empty array when nothing matches", () => {
    assert.deepEqual(filterByItemListSearch(rows, "nonexistent", (r) => r), []);
  });
});
