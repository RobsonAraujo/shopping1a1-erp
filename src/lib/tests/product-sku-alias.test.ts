import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandSkuGroup,
  getAliasSkusForCanonical,
  indexBySkuWithAliases,
  resolveCanonicalSku,
  skuMatchesGroup,
} from "@/lib/product-sku-alias";

const aliasMap = new Map<string, string>([
  ["MXT - Cabo Guitar 10m (Próprio)", "MXT - Cabo 81063 10m (Próprio)"],
  ["SKU-LEGADO", "SKU-ATUAL"],
]);

describe("resolveCanonicalSku", () => {
  it("returns canonical for alias", () => {
    assert.equal(
      resolveCanonicalSku("MXT - Cabo Guitar 10m (Próprio)", aliasMap),
      "MXT - Cabo 81063 10m (Próprio)",
    );
  });

  it("returns same sku when no alias", () => {
    assert.equal(resolveCanonicalSku("OUTRO", aliasMap), "OUTRO");
  });

  it("trims input", () => {
    assert.equal(
      resolveCanonicalSku("  SKU-LEGADO  ", aliasMap),
      "SKU-ATUAL",
    );
  });

  it("resolves alias with double internal spaces to canonical", () => {
    assert.equal(
      resolveCanonicalSku("MXT  - Cabo Guitar 10m (Próprio)", aliasMap),
      "MXT - Cabo 81063 10m (Próprio)",
    );
  });
});

describe("getAliasSkusForCanonical", () => {
  it("lists aliases for canonical sku", () => {
    assert.deepEqual(
      getAliasSkusForCanonical("SKU-ATUAL", aliasMap),
      ["SKU-LEGADO"],
    );
  });
});

describe("expandSkuGroup", () => {
  it("returns canonical plus aliases", () => {
    const group = expandSkuGroup("SKU-LEGADO", aliasMap);
    assert.deepEqual(group, ["SKU-ATUAL", "SKU-LEGADO"]);
  });

  it("works when input is already canonical", () => {
    const group = expandSkuGroup("SKU-ATUAL", aliasMap);
    assert.deepEqual(group, ["SKU-ATUAL", "SKU-LEGADO"]);
  });
});

describe("skuMatchesGroup", () => {
  it("matches alias and canonical against group", () => {
    assert.equal(skuMatchesGroup("SKU-LEGADO", "SKU-ATUAL", aliasMap), true);
    assert.equal(skuMatchesGroup("SKU-ATUAL", "SKU-LEGADO", aliasMap), true);
    assert.equal(skuMatchesGroup("OUTRO", "SKU-ATUAL", aliasMap), false);
  });
});

describe("indexBySkuWithAliases", () => {
  it("maps alias keys to canonical product values", () => {
    const byCanonical = new Map([["SKU-ATUAL", { cost: 10 }]]);
    const indexed = indexBySkuWithAliases(
      byCanonical,
      ["SKU-LEGADO", "SKU-ATUAL"],
      aliasMap,
    );
    assert.deepEqual(indexed.get("SKU-LEGADO"), { cost: 10 });
    assert.deepEqual(indexed.get("SKU-ATUAL"), { cost: 10 });
  });
});
