import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { buildListingGroups, type ListingGroupListing } from "../listing-groups";
import { cadastroBlockedMessage, pendingOptionCadastros, planProductImport } from "../product-options";

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

function item(id: string, up: string, over: Partial<ItemBody> = {}): ItemBody {
  return {
    id,
    title: `Item ${id}`,
    user_product_id: up,
    listing_type_id: "gold_special",
    status: "active",
    seller_custom_field: `SKU-${up}`,
    ...over,
  } as ItemBody;
}

describe("planProductImport", () => {
  it("suggests one cadastro per physical product, with its sale options", () => {
    const groups = buildListingGroups({
      listings: [
        listing("MLB-C", "UP1"),
        listing("MLB-P", "UP1", { listingTypeId: "gold_pro", createdAt: day(20) }),
      ],
      products: [],
      kitMlItemIds: [],
      stockPrimaryById: new Map(),
    });
    const plan = planProductImport(
      [item("MLB-P", "UP1", { listing_type_id: "gold_pro" }), item("MLB-C", "UP1")],
      groups,
    );
    assert.equal(plan.suggestions.length, 1);
    assert.equal(plan.suggestions[0].mlItemId, "MLB-C");
    assert.deepEqual(
      plan.suggestions[0].options.map((o) => o.mlItemId),
      ["MLB-C", "MLB-P"],
    );
    assert.equal(plan.groupedOptionsCount, 1);
  });

  it("does not suggest an option of a product that is already registered", () => {
    const groups = buildListingGroups({
      listings: [listing("MLB-C", "UP1"), listing("MLB-P", "UP1", { listingTypeId: "gold_pro" })],
      products: [{ mlItemId: "MLB-C", needsCostReview: false, createdAt: day(1) }],
      kitMlItemIds: [],
      stockPrimaryById: new Map(),
    });
    const plan = planProductImport([item("MLB-C", "UP1"), item("MLB-P", "UP1")], groups);
    assert.deepEqual(plan.suggestions, []);
    assert.equal(plan.groupedOptionsCount, 1);
  });

  it("keeps listings of different physical products apart (Próprio × Catálogo with their own UP)", () => {
    const groups = buildListingGroups({
      listings: [listing("MLB-CAT", "UP1"), listing("MLB-PROPRIO", "UP2", { catalogListing: false })],
      products: [],
      kitMlItemIds: [],
      stockPrimaryById: new Map(),
    });
    const plan = planProductImport([item("MLB-CAT", "UP1"), item("MLB-PROPRIO", "UP2")], groups);
    assert.equal(plan.suggestions.length, 2);
  });
});

describe("cadastroBlockedMessage", () => {
  const groups = buildListingGroups({
    listings: [listing("MLB-C", "UP1"), listing("MLB-P", "UP1", { listingTypeId: "gold_pro" })],
    products: [
      { mlItemId: "MLB-C", needsCostReview: false, createdAt: day(1) },
      { mlItemId: "MLB-P", needsCostReview: true, createdAt: day(24) },
    ],
    kitMlItemIds: [],
    stockPrimaryById: new Map(),
  });

  it("blocks a cadastro for the option of a registered product, naming the principal", () => {
    const message = cadastroBlockedMessage(groups, { id: "MLB-P", listing_type_id: "gold_pro" });
    assert.match(message ?? "", /opção Premium de MLB-C/);
  });

  it("lists the pending option cadastros for the bulk removal", () => {
    assert.deepEqual(pendingOptionCadastros(groups), ["MLB-P"]);
  });
});
