import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveMlAnchorNetAmount,
  splitBusinessPrices,
  type ItemPriceRecord,
} from "../item-quantity-prices";

describe("splitBusinessPrices", () => {
  const prices: ItemPriceRecord[] = [
    {
      id: "101",
      type: "standard",
      amount: 47.38,
      currency_id: "BRL",
      conditions: { context_restrictions: [] },
    },
    {
      id: "150",
      type: "standard",
      amount: 30.8,
      currency_id: "BRL",
      amount_tax_inclusion_type: "net",
      conditions: {
        context_restrictions: ["channel_marketplace", "user_type_business"],
        min_purchase_unit: 1,
      },
    },
    {
      id: "151",
      type: "standard",
      amount: 26.59,
      currency_id: "BRL",
      amount_tax_inclusion_type: "net",
      conditions: {
        context_restrictions: ["channel_marketplace", "user_type_business"],
        min_purchase_unit: 2,
      },
    },
    {
      id: "152",
      type: "standard",
      amount: 24.59,
      currency_id: "BRL",
      amount_tax_inclusion_type: "net",
      conditions: {
        context_restrictions: ["channel_marketplace", "user_type_business"],
        min_purchase_unit: 5,
      },
    },
    {
      id: "153",
      type: "standard",
      amount: 22.59,
      currency_id: "BRL",
      amount_tax_inclusion_type: "net",
      conditions: {
        context_restrictions: ["channel_marketplace", "user_type_business"],
        min_purchase_unit: 10,
      },
    },
  ];

  it("separates ML anchor from discount tiers", () => {
    const result = splitBusinessPrices(prices);

    assert.deepEqual(result.anchor, { minPurchaseUnit: 1, netAmount: 30.8 });
    assert.equal(result.discountTiers.length, 3);
    assert.equal(result.discountTiers[0].minPurchaseUnit, 2);
    assert.equal(result.discountTiers[0].netAmount, 26.59);
    assert.equal(result.discountTiers[1].minPurchaseUnit, 5);
    assert.equal(result.discountTiers[2].minPurchaseUnit, 10);
  });

  it("ignores non-business prices", () => {
    const result = splitBusinessPrices([
      {
        id: "1",
        amount: 100,
        conditions: { context_restrictions: [] },
      },
    ]);

    assert.equal(result.anchor, null);
    assert.equal(result.discountTiers.length, 0);
  });
});

describe("resolveMlAnchorNetAmount", () => {
  it("prefers active promotion price for anchor", () => {
    const amount = resolveMlAnchorNetAmount(
      [
        {
          id: "101",
          type: "standard",
          amount: 47.38,
          conditions: { context_restrictions: [] },
        },
        {
          id: "140",
          type: "promotion",
          amount: 30.8,
          conditions: { context_restrictions: ["channel_marketplace"] },
        },
      ],
      26,
    );

    assert.equal(amount, 30.8);
  });
});
