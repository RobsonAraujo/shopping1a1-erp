import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNetWholesalePricesPayload } from "./build-net-wholesale-prices-payload";
import type { ItemPriceRecord } from "./item-quantity-prices";

describe("buildNetWholesalePricesPayload", () => {
  const currentPrices: ItemPriceRecord[] = [
    {
      id: "1",
      type: "standard",
      amount: 100,
      currency_id: "BRL",
      conditions: { context_restrictions: [] },
    },
    {
      id: "9",
      type: "standard",
      amount: 90,
      currency_id: "BRL",
      amount_tax_inclusion_type: "net",
      conditions: {
        context_restrictions: ["channel_marketplace", "user_type_business"],
        min_purchase_unit: 15,
      },
    },
  ];

  it("keeps retail standard price and sends anchor plus discount tiers", () => {
    const result = buildNetWholesalePricesPayload({
      anchorNetAmount: 88,
      currencyId: "BRL",
      tiers: [
        { level: 2, minPurchaseUnit: 5, netAmount: 84 },
        { level: 3, minPurchaseUnit: 10, netAmount: 80 },
      ],
      currentPrices,
      replaceAllBusinessTiers: true,
    });

    assert.deepEqual(result.prices[0], { id: "1" });
    assert.equal(result.prices[1].amount, 88);
    assert.equal(result.prices[1].conditions?.min_purchase_unit, 1);
    assert.equal(result.prices[1].amount_tax_inclusion_type, "net");

    const businessTiers = result.prices.filter(
      (p) => (p.conditions?.min_purchase_unit ?? 0) > 1,
    );
    assert.equal(businessTiers.length, 2);
    assert.equal(businessTiers[0].conditions?.min_purchase_unit, 5);
    assert.equal(businessTiers[0].amount, 84);
    assert.equal(businessTiers[1].conditions?.min_purchase_unit, 10);
    assert.equal(businessTiers[1].amount, 80);
  });

  it("rejects tiers with increasing prices", () => {
    assert.throws(
      () =>
        buildNetWholesalePricesPayload({
          anchorNetAmount: 88,
          currencyId: "BRL",
          tiers: [
            { level: 2, minPurchaseUnit: 5, netAmount: 80 },
            { level: 3, minPurchaseUnit: 10, netAmount: 85 },
          ],
          currentPrices: [],
        }),
      /devem cair/,
    );
  });

  it("allows anchor-only payload without discount tiers", () => {
    const result = buildNetWholesalePricesPayload({
      anchorNetAmount: 26.59,
      currencyId: "BRL",
      tiers: [],
      currentPrices: [],
    });

    assert.equal(result.prices.length, 1);
    assert.equal(result.prices[0].amount, 26.59);
    assert.equal(result.prices[0].conditions?.min_purchase_unit, 1);
  });
});
