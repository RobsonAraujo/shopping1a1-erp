import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import { fetchSellerShippingCost } from "../seller-shipping-cost";
import type { ItemBody } from "../types";

const item: ItemBody = {
  id: "MLB5236253058",
  title: "Test",
  price: 58.4,
  currency_id: "BRL",
  available_quantity: 1,
  sold_quantity: 0,
  status: "active",
  permalink: "https://example.com",
  listing_type_id: "gold_special",
  shipping: {
    free_shipping: false,
    mode: "me2",
    logistic_type: "fulfillment",
  },
};

describe("fetchSellerShippingCost", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("sends item_price and free_shipping with item_id for promo-aware quotes", async () => {
    const seenUrls: string[] = [];
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      seenUrls.push(String(input));
      return new Response(
        JSON.stringify({
          coverage: { all_country: { list_cost: 6.65, currency_id: "BRL" } },
        }),
        { status: 200 },
      );
    });

    const result = await fetchSellerShippingCost("token", {
      sellerId: 1701342332,
      item,
      effectiveSalePrice: 26,
    });

    assert.equal(result.cost, 6.65);
    assert.equal(result.applicable, true);
    assert.equal(seenUrls.length, 1);
    const url = new URL(seenUrls[0]!);
    assert.equal(url.searchParams.get("item_id"), item.id);
    assert.equal(url.searchParams.get("item_price"), "26");
    assert.equal(url.searchParams.get("free_shipping"), "false");
    assert.equal(url.searchParams.get("mode"), "me2");
  });

  it("returns zero when list_cost is missing", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify({ coverage: {} }), { status: 200 });
    });

    const result = await fetchSellerShippingCost("token", {
      sellerId: 1,
      item,
      effectiveSalePrice: 26,
    });

    assert.equal(result.cost, 0);
    assert.equal(result.applicable, false);
  });
});
