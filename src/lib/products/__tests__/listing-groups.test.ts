import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListingGroups,
  pickPrincipal,
  type ListingGroupListing,
  type PrincipalCandidate,
} from "../listing-groups";

const day = (d: number) => new Date(Date.UTC(2026, 10, d));

function candidate(id: string, over: Partial<PrincipalCandidate> = {}): PrincipalCandidate {
  return { mlItemId: id, product: null, isKit: false, active: true, firstSeenAt: day(1), ...over };
}

function listing(id: string, over: Partial<ListingGroupListing> = {}): ListingGroupListing {
  return {
    mlItemId: id,
    userProductId: null,
    stockItemId: null,
    listingTypeId: "gold_special",
    catalogListing: true,
    mlStatus: "active",
    createdAt: day(1),
    ...over,
  };
}

describe("pickPrincipal", () => {
  it("prefers the registered listing", () => {
    const principal = pickPrincipal([
      candidate("MLB1", { firstSeenAt: day(1) }),
      candidate("MLB2", { product: { pending: false, createdAt: day(5) }, firstSeenAt: day(9) }),
    ]);
    assert.equal(principal, "MLB2");
  });

  it("a cadastro with cost beats a pending one, even when the pending is the stock primary", () => {
    const principal = pickPrincipal(
      [
        candidate("MLB1", { product: { pending: true, createdAt: day(1) } }),
        candidate("MLB2", { product: { pending: false, createdAt: day(9) } }),
      ],
      new Set(["MLB1"]),
    );
    assert.equal(principal, "MLB2");
  });

  it("between two cadastros with cost: the stock primary, then the oldest", () => {
    const both = [
      candidate("MLB1", { product: { pending: false, createdAt: day(1) } }),
      candidate("MLB2", { product: { pending: false, createdAt: day(9) } }),
    ];
    assert.equal(pickPrincipal(both, new Set(["MLB2"])), "MLB2");
    assert.equal(pickPrincipal(both), "MLB1");
  });

  it("without cadastro: the stock primary, then the active, then the oldest", () => {
    const options = [
      candidate("MLB1", { active: false, firstSeenAt: day(1) }),
      candidate("MLB2", { active: true, firstSeenAt: day(5) }),
      candidate("MLB3", { active: true, firstSeenAt: day(3) }),
    ];
    assert.equal(pickPrincipal(options, new Set(["MLB1"])), "MLB1");
    assert.equal(pickPrincipal(options), "MLB3");
  });

  it("does not switch the principal when a registered option is paused", () => {
    const registered = { product: { pending: false, createdAt: day(1) } };
    const before = pickPrincipal([
      candidate("MLB1", { ...registered, active: true }),
      candidate("MLB2", { active: true }),
    ]);
    const after = pickPrincipal([
      candidate("MLB1", { ...registered, active: false }),
      candidate("MLB2", { active: true }),
    ]);
    assert.equal(before, "MLB1");
    assert.equal(after, "MLB1");
  });

  it("kit groups follow the registered kit", () => {
    assert.equal(
      pickPrincipal([candidate("MLB1"), candidate("MLB2", { isKit: true, firstSeenAt: day(9) })]),
      "MLB2",
    );
  });
});

describe("buildListingGroups", () => {
  const stockPrimaryById = new Map([["si-1", "MLB-C"]]);
  const groups = buildListingGroups({
    listings: [
      listing("MLB-C", { userProductId: "UP1", stockItemId: "si-1", listingTypeId: "gold_special" }),
      listing("MLB-P", { userProductId: "UP1", stockItemId: "si-1", listingTypeId: "gold_pro", createdAt: day(20) }),
      listing("MLB-SOLO", { userProductId: "UP2" }),
      listing("MLB-NOUP"),
    ],
    products: [
      { mlItemId: "MLB-C", needsCostReview: false, createdAt: day(1) },
      { mlItemId: "MLB-P", needsCostReview: true, createdAt: day(24) },
    ],
    kitMlItemIds: [],
    stockPrimaryById,
  });

  it("maps every option to the principal and leaves the rest alone", () => {
    assert.equal(groups.principalOf("MLB-P"), "MLB-C");
    assert.equal(groups.principalOf("MLB-C"), "MLB-C");
    assert.equal(groups.principalOf("MLB-SOLO"), "MLB-SOLO");
    assert.equal(groups.principalOf("MLB-NOUP"), "MLB-NOUP");
    assert.equal(groups.principalOf("MLB-UNKNOWN"), "MLB-UNKNOWN");
    assert.equal(groups.isOption("MLB-P"), true);
    assert.equal(groups.isOption("MLB-C"), false);
  });

  it("lists the options principal first, with the cadastro state", () => {
    assert.deepEqual(
      groups.optionsOf("MLB-P").map((o) => [o.mlItemId, o.isPrincipal, o.registered, o.pendingCost]),
      [
        ["MLB-C", true, true, false],
        ["MLB-P", false, true, true],
      ],
    );
    assert.equal(groups.multiOptionGroups().length, 1);
    assert.deepEqual(groups.stockPrimaryMismatches(), []);
  });

  it("groups a listing linked by hand to the stock item even without UP", () => {
    const manual = buildListingGroups({
      listings: [
        listing("MLB-A", { userProductId: "UP1", stockItemId: "si-1" }),
        listing("MLB-B", { userProductId: null, stockItemId: "si-1" }),
      ],
      products: [],
      kitMlItemIds: [],
      stockPrimaryById: new Map([["si-1", "MLB-A"]]),
    });
    assert.equal(manual.principalOf("MLB-B"), "MLB-A");
  });

  it("reports a stock item whose primary is not the registered listing", () => {
    const misaligned = buildListingGroups({
      listings: [
        listing("MLB-A", { userProductId: "UP1", stockItemId: "si-1" }),
        listing("MLB-B", { userProductId: "UP1", stockItemId: "si-1" }),
      ],
      products: [{ mlItemId: "MLB-B", needsCostReview: false, createdAt: day(1) }],
      kitMlItemIds: [],
      stockPrimaryById: new Map([["si-1", "MLB-A"]]),
    });
    assert.equal(misaligned.principalOf("MLB-A"), "MLB-B");
    assert.deepEqual(misaligned.stockPrimaryMismatches(), [{ stockItemId: "si-1", principal: "MLB-B" }]);
  });
});
