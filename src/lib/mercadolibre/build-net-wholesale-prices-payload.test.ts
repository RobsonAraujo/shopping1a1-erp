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

  it("keeps retail standard price and sends anchor plus requested tiers", () => {
    const result = buildNetWholesalePricesPayload({
      retailUnitPrice: 100,
      currencyId: "BRL",
      tiers: [
        { level: 1, minPurchaseUnit: 2, netAmount: 88 },
        { level: 2, minPurchaseUnit: 5, netAmount: 84 },
        { level: 3, minPurchaseUnit: 10, netAmount: 80 },
      ],
      currentPrices,
      replaceAllBusinessTiers: true,
    });

    assert.deepEqual(result.prices[0], { id: "1" });
    assert.equal(result.prices[1].amount, 100);
    assert.equal(result.prices[1].conditions?.min_purchase_unit, 1);
    assert.equal(result.prices[1].amount_tax_inclusion_type, "net");

    const businessTiers = result.prices.filter(
      (p) => (p.conditions?.min_purchase_unit ?? 0) > 1,
    );
    assert.equal(businessTiers.length, 3);
    assert.equal(businessTiers[0].conditions?.min_purchase_unit, 2);
    assert.equal(businessTiers[0].amount, 88);
    assert.equal(businessTiers[2].conditions?.min_purchase_unit, 10);
    assert.equal(businessTiers[2].amount, 80);
  });

  it("rejects tiers with increasing prices", () => {
    assert.throws(
      () =>
        buildNetWholesalePricesPayload({
          retailUnitPrice: 100,
          currencyId: "BRL",
          tiers: [
            { level: 1, minPurchaseUnit: 2, netAmount: 80 },
            { level: 2, minPurchaseUnit: 5, netAmount: 85 },
          ],
          currentPrices: [],
        }),
      /devem cair/,
    );
  });
});
