import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSkuSupplier,
  groupBySkuSupplier,
  isKitItem,
  getItemSku,
} from "../item-sku";
import type { ItemBody } from "../types";

function item(overrides: Partial<ItemBody> = {}): ItemBody {
  return {
    id: "MLB1",
    title: "Item",
    status: "active",
    ...overrides,
  } as ItemBody;
}

describe("getSkuSupplier", () => {
  it("returns the first word of the sku", () => {
    assert.equal(getSkuSupplier("MXT-123"), "MXT-123");
    assert.equal(getSkuSupplier("MXT 123"), "MXT");
  });

  it("returns fallback label for null/undefined/blank sku", () => {
    assert.equal(getSkuSupplier(null), "Sem fornecedor");
    assert.equal(getSkuSupplier(undefined), "Sem fornecedor");
    assert.equal(getSkuSupplier("   "), "Sem fornecedor");
  });

  it("trims leading whitespace before splitting", () => {
    assert.equal(getSkuSupplier("  Aquario 45"), "Aquario");
  });
});

describe("groupBySkuSupplier", () => {
  it("groups rows by supplier and sorts alphabetically pt-BR", () => {
    const rows = [
      { sku: "Zulu 1" },
      { sku: "Aquario 1" },
      { sku: "Aquario 2" },
    ];
    const groups = groupBySkuSupplier(rows, (r) => r.sku);
    assert.deepEqual(
      groups.map((g) => g.supplier),
      ["Aquario", "Zulu"],
    );
    assert.equal(groups[0].rows.length, 2);
  });

  it("pushes 'Sem fornecedor' group to the end regardless of alphabet", () => {
    const rows = [{ sku: null }, { sku: "Aaa 1" }, { sku: "Zzz 1" }];
    const groups = groupBySkuSupplier(rows, (r) => r.sku);
    assert.equal(groups.at(-1)?.supplier, "Sem fornecedor");
    assert.deepEqual(
      groups.map((g) => g.supplier),
      ["Aaa", "Zzz", "Sem fornecedor"],
    );
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(groupBySkuSupplier([], () => null), []);
  });
});

describe("getItemSku", () => {
  it("prefers seller_custom_field over SELLER_SKU attribute", () => {
    const it1 = item({
      seller_custom_field: "ABC-1",
      attributes: [{ id: "SELLER_SKU", value_name: "XYZ-2" }],
    } as Partial<ItemBody>);
    assert.equal(getItemSku(it1), "ABC-1");
  });

  it("falls back to SELLER_SKU attribute when seller_custom_field is absent", () => {
    const it1 = item({
      attributes: [{ id: "SELLER_SKU", value_name: "XYZ-2" }],
    } as Partial<ItemBody>);
    assert.equal(getItemSku(it1), "XYZ-2");
  });

  it("returns null when neither source has a sku", () => {
    const it1 = item({ attributes: [{ id: "BRAND", value_name: "Foo" }] } as Partial<ItemBody>);
    assert.equal(getItemSku(it1), null);
  });

  it("returns null when seller_custom_field is blank", () => {
    const it1 = item({ seller_custom_field: "   " } as Partial<ItemBody>);
    assert.equal(getItemSku(it1), null);
  });
});

describe("isKitItem", () => {
  it("is true when tagged 'bundle' and has no sku", () => {
    const it1 = item({ tags: ["bundle"] } as Partial<ItemBody>);
    assert.equal(isKitItem(it1), true);
  });

  it("is false when tagged 'bundle' but has a sku", () => {
    const it1 = item({
      tags: ["bundle"],
      seller_custom_field: "ABC-1",
    } as Partial<ItemBody>);
    assert.equal(isKitItem(it1), false);
  });

  it("is false when not tagged 'bundle'", () => {
    const it1 = item({ tags: ["good_quality"] } as Partial<ItemBody>);
    assert.equal(isKitItem(it1), false);
  });

  it("is false when tags is undefined", () => {
    assert.equal(isKitItem(item()), false);
  });
});
