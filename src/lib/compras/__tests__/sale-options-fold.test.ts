import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { buildListingGroups, type ListingGroupListing } from "@/lib/products/listing-groups";
import {
  foldSaleOptions,
  foldSalesByKey,
  foldWarehouseByKey,
  pooledMlStock,
} from "../sale-options-fold";

const day = (d: number) => new Date(Date.UTC(2026, 10, d));

function listing(id: string, up: string, over: Partial<ListingGroupListing> = {}): ListingGroupListing {
  return {
    mlItemId: id,
    userProductId: up,
    stockItemId: null,
    listingTypeId: "gold_special",
    catalogListing: true,
    mlStatus: "active",
    createdAt: day(1),
    ...over,
  };
}

function item(id: string, qty: number, logistic: "fulfillment" | "xd_drop_off" = "fulfillment"): ItemBody {
  return {
    id,
    title: `Item ${id}`,
    status: "active",
    available_quantity: qty,
    shipping: { logistic_type: logistic },
  } as unknown as ItemBody;
}

const groups = buildListingGroups({
  listings: [
    listing("MLB-C", "UP1"),
    listing("MLB-P", "UP1", { listingTypeId: "gold_pro", createdAt: day(20) }),
    listing("MLB-SOLO", "UP2"),
  ],
  products: [{ mlItemId: "MLB-C", needsCostReview: false, createdAt: day(1) }],
  kitMlItemIds: [],
  stockPrimaryById: new Map(),
});

describe("foldSaleOptions", () => {
  it("turns the Clássico + Premium of one product into one item on the principal", () => {
    const fold = foldSaleOptions([item("MLB-P", 30), item("MLB-C", 30), item("MLB-SOLO", 5)], groups);
    assert.deepEqual(fold.items.map((i) => i.id).sort(), ["MLB-C", "MLB-SOLO"]);
    assert.equal(fold.keyOf("MLB-P"), "MLB-C");
    assert.deepEqual(fold.membersOf("MLB-C"), ["MLB-C", "MLB-P"]);
    // As duas opções informam o mesmo estoque do Full: conta uma vez.
    assert.equal(fold.items.find((i) => i.id === "MLB-C")?.available_quantity, 30);
    assert.equal(fold.optionsOf("MLB-C")?.length, 2);
    assert.equal(fold.optionsOf("MLB-SOLO"), undefined);
  });

  it("uses the first option read when the principal is not among the listings", () => {
    const fold = foldSaleOptions([item("MLB-P", 12)], groups);
    assert.deepEqual(fold.items.map((i) => i.id), ["MLB-P"]);
    assert.equal(fold.keyOf("MLB-P"), "MLB-P");
  });

  it("sums the Full and the depósito when one option is Full and the other is not", () => {
    assert.equal(pooledMlStock([item("A", 40, "fulfillment"), item("B", 7, "xd_drop_off")]), 47);
    assert.equal(pooledMlStock([item("A", 40), item("B", 40)]), 40);
  });

  it("plans the product with the summed sales: ML 30 + home 20, sales 40 + 20", () => {
    const fold = foldSaleOptions([item("MLB-C", 30), item("MLB-P", 30)], groups);
    const sales = foldSalesByKey({ "MLB-C": 40, "MLB-P": 20 }, fold);
    assert.deepEqual(sales, { "MLB-C": 60 });
    // Sem estoque automático: o galpão digitado nas duas opções é somado.
    const warehouse = foldWarehouseByKey(
      {
        "MLB-C": { quantity: 20, purchaseLeadTimeDays: 10 },
        "MLB-P": { quantity: 0, purchaseLeadTimeDays: null },
      },
      fold,
    );
    assert.deepEqual(warehouse, { "MLB-C": { quantity: 20, purchaseLeadTimeDays: 10 } });
    const total = (fold.items[0].available_quantity ?? 0) + warehouse["MLB-C"].quantity;
    const perDay = sales["MLB-C"] / 30;
    assert.equal(total, 50);
    assert.equal(perDay, 2);
    assert.equal(total / perDay, 25);
  });
});
