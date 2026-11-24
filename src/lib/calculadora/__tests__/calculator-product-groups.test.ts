import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupCalculatorListings, type CalculatorListing } from "../calculator-listings";

function listing(
  mlItemId: string,
  over: Partial<CalculatorListing> = {},
): CalculatorListing {
  return {
    mlItemId,
    title: `Item ${mlItemId}`,
    sku: null,
    imageUrl: null,
    permalink: "",
    catalogListing: true,
    mlStatus: "active",
    ...over,
  };
}

const option = (principal: string, label: string) => ({
  saleOption: { principalMlItemId: principal, label, optionsLabel: "Clássico + Premium" },
});

const classico = listing("MLB-C", option("MLB-C", "Clássico"));
const premium = listing("MLB-P", option("MLB-C", "Premium"));
const solo = listing("MLB-S");
const all = [classico, premium, solo];

describe("groupCalculatorListings", () => {
  it("shows each product once, with its options principal first", () => {
    const groups = groupCalculatorListings([premium, solo, classico], all);
    assert.deepEqual(
      groups.map((g) => [g.key, g.lead.mlItemId, g.options.map((o) => o.mlItemId)]),
      [
        ["MLB-C", "MLB-C", ["MLB-C", "MLB-P"]],
        ["MLB-S", "MLB-S", ["MLB-S"]],
      ],
    );
  });

  it("keeps every option when the search found only one of them", () => {
    const [group] = groupCalculatorListings([premium], all);
    assert.deepEqual(group.options.map((o) => o.mlItemId), ["MLB-C", "MLB-P"]);
  });

  it("applies the Próprio/Catálogo filter to the options", () => {
    const own = listing("MLB-OWN", { ...option("MLB-C", "Clássico · Próprio"), catalogListing: false });
    const groups = groupCalculatorListings([own], [...all, own], (l) => !l.catalogListing);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].options.map((o) => o.mlItemId), ["MLB-OWN"]);
    assert.equal(groups[0].lead.mlItemId, "MLB-OWN");
  });
});
