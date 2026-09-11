import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCatalogLosingRows,
  type CatalogLosingListing,
} from "@/lib/home/catalog-losing-data";

function listing(
  overrides: Partial<CatalogLosingListing> = {},
): CatalogLosingListing {
  return {
    mlItemId: "MLB1",
    skuSnapshot: "SKU-A",
    titleSnapshot: "Produto A",
    imageUrlSnapshot: "https://example.com/a.jpg",
    catalogSellerPrice: 110,
    catalogPriceToWin: 100,
    ...overrides,
  };
}

describe("buildCatalogLosingRows", () => {
  it("maps listing snapshots into alert rows with price gap", () => {
    const [row] = buildCatalogLosingRows([listing()]);
    assert.equal(row.mlItemId, "MLB1");
    assert.equal(row.sku, "SKU-A");
    assert.equal(row.title, "Produto A");
    assert.equal(row.imageUrl, "https://example.com/a.jpg");
    assert.equal(row.sellerPrice, 110);
    assert.equal(row.priceToWin, 100);
    assert.equal(row.gap, 10);
  });

  it("falls back to title then item id when SKU is missing", () => {
    const [withTitle] = buildCatalogLosingRows([
      listing({ skuSnapshot: null, titleSnapshot: "Só título" }),
    ]);
    const [withId] = buildCatalogLosingRows([
      listing({
        mlItemId: "MLB9",
        skuSnapshot: null,
        titleSnapshot: null,
      }),
    ]);
    assert.equal(withTitle.sku, "Só título");
    assert.equal(withId.sku, "MLB9");
    assert.equal(withId.title, "MLB9");
  });

  it("sorts the largest gap first and puts missing gaps last", () => {
    const rows = buildCatalogLosingRows([
      listing({
        mlItemId: "MLB1",
        skuSnapshot: "SKU-A",
        catalogSellerPrice: 105,
        catalogPriceToWin: 100,
      }),
      listing({
        mlItemId: "MLB2",
        skuSnapshot: "SKU-B",
        catalogSellerPrice: 140,
        catalogPriceToWin: 100,
      }),
      listing({
        mlItemId: "MLB3",
        skuSnapshot: "SKU-C",
        catalogSellerPrice: null,
        catalogPriceToWin: null,
      }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.mlItemId),
      ["MLB2", "MLB1", "MLB3"],
    );
  });

  it("converts decimal-like values before computing the gap", () => {
    const [row] = buildCatalogLosingRows([
      listing({
        catalogSellerPrice: "99.9",
        catalogPriceToWin: "90",
      }),
    ]);
    assert.equal(row.sellerPrice, 99.9);
    assert.equal(row.priceToWin, 90);
    assert.equal(row.gap, 9.9);
  });
});
