import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRotinaView } from "../view";
import { groupActionsByProduct } from "../view-summary";
import { NOW, TZ, listing, settings } from "./fixtures";

const saleOptions = new Map([
  ["CLASSICO", { principalMlItemId: "CLASSICO", optionsLabel: "Clássico + Premium" }],
  ["PREMIUM", { principalMlItemId: "CLASSICO", optionsLabel: "Clássico + Premium" }],
]);

function promoActions() {
  const view = buildRotinaView({
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: [
      listing({ mlItemId: "OUTRO", title: "Outro", hasPromotion: false, regularPrice: null, unitsPerDay: 9 }),
      listing({ mlItemId: "PREMIUM", title: "Cabo", listingTypeId: "gold_pro", hasPromotion: false, regularPrice: null, unitsPerDay: 1 }),
      listing({ mlItemId: "CLASSICO", title: "Cabo", hasPromotion: false, regularPrice: null, unitsPerDay: 3 }),
    ],
    catalogLive: [],
    targets: new Map(),
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
    saleOptions,
  });
  return view.actions.filter((action) => action.rule === "promo_missing");
}

describe("groupActionsByProduct", () => {
  it("joins the sale options of one product in a block, principal first", () => {
    const blocks = groupActionsByProduct(promoActions());
    const product = blocks.find((block) => block.key === "CLASSICO");
    assert.ok(product);
    assert.deepEqual(
      product.actions.map((action) => action.listing.mlItemId),
      ["CLASSICO", "PREMIUM"],
    );
    assert.equal(product.lead.listing.mlItemId, "CLASSICO");
  });

  it("keeps a product without options as a block of one, in the task's order", () => {
    const actions = promoActions();
    const blocks = groupActionsByProduct(actions);
    assert.equal(blocks.length, 2);
    // O bloco entra onde aparece a primeira das suas ações.
    const firstKeys = actions.map((action) => action.listing.saleOption?.principalMlItemId ?? action.listing.mlItemId);
    assert.deepEqual(blocks.map((block) => block.key), [...new Set(firstKeys)]);
    assert.equal(blocks.find((block) => block.key === "OUTRO")?.actions.length, 1);
  });
});
