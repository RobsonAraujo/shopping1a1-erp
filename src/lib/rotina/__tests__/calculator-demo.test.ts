import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEMO_FREE_SHIPPING_FROM,
  DEMO_LISTINGS,
  buildDemoCalculatorData,
  createDemoSimulatorApi,
  demoCostsAt,
  demoFixedFee,
  demoFloorView,
} from "@/lib/rotina/calculator-demo";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";

const kit = DEMO_LISTINGS.find((listing) => listing.sku === "CABO-USB-C-K3")!;

describe("demo calculator", () => {
  it("charges the fixed fee below free shipping, and shipping from R$ 79 on", () => {
    assert.equal(demoFixedFee(10), 5);
    assert.equal(demoFixedFee(28.99), 6.25);
    assert.equal(demoFixedFee(78.9), 6.75);
    assert.equal(demoFixedFee(DEMO_FREE_SHIPPING_FROM), 0);
    assert.deepEqual(demoCostsAt(kit, 78.9, "gold_pro").shippingCost, 0);
    assert.deepEqual(demoCostsAt(kit, 79, "gold_pro").shippingCost, kit.freeShippingCost);
  });

  it("finds the floor below R$ 79 and flags the band right above it", () => {
    const floor = demoFloorView(kit, "gold_pro", 8);
    assert.ok(floor.effectivePrice !== null && floor.effectivePrice < DEMO_FREE_SHIPPING_FROM);
    assert.equal(floor.bands.length, 1);
    assert.equal(floor.bands[0].from, DEMO_FREE_SHIPPING_FROM);
    // No piso a meta fecha; um centavo abaixo, não.
    const atFloor = simulateMarginAtPrice(
      floor.effectivePrice,
      demoCostsAt(kit, floor.effectivePrice, "gold_pro"),
      {
        productCost: kit.productCost,
        extraCosts: 0,
        taxRatePercent: kit.taxRatePercent,
        mlFeeRebate: null,
        listingTypeId: "gold_pro",
        listingTypeLabel: "Premium",
        adsMetricsAvailable: true,
        tacosPercent: kit.tacosPercent,
        adsCost: null,
        adsUnitsSold: null,
      },
      8,
    );
    assert.equal(atFloor.meetsTarget, true);
  });

  it("raises the floor with a higher accepted margin, and Clássico is cheaper than Premium", () => {
    const premium8 = demoFloorView(kit, "gold_pro", 8).effectivePrice!;
    const premium15 = demoFloorView(kit, "gold_pro", 15).effectivePrice!;
    const classic8 = demoFloorView(kit, "gold_special", 8).effectivePrice!;
    assert.ok(premium15 > premium8);
    assert.ok(classic8 < premium8);
  });

  it("answers the simulator locally, with the panel's margin math", async () => {
    const api = createDemoSimulatorApi();
    const simulation = await api.simulate({ mlItemId: kit.mlItemId, prices: [78.9, 80] });
    assert.equal(simulation.inputsFrom, "demo");
    const [below, above] = simulation.results;
    // O degrau dos R$ 79: acima dele o frete grátis come a margem.
    assert.ok((below.marginAfterAdsPercent ?? 0) > (above.marginAfterAdsPercent ?? 0) + 10);

    const today = await api.simulate({ mlItemId: kit.mlItemId });
    assert.equal(today.results[0].price, kit.salePrice);

    const floor = await api.floor({ mlItemId: kit.mlItemId, targetPercent: 15 });
    assert.equal(floor.targetPercent, 15);
    assert.equal(floor.floor?.effectivePrice, demoFloorView(kit, "gold_pro", 15).effectivePrice);
  });

  it("builds calculator rows whose today's numbers and shortcuts match the engine", () => {
    const data = buildDemoCalculatorData();
    assert.equal(data.listings.length, DEMO_LISTINGS.length);
    const row = data.listings.find((listing) => listing.mlItemId === kit.mlItemId)!;
    assert.equal(row.today?.floorPrice, demoFloorView(kit, "gold_pro", kit.targetPercent).effectivePrice);
    assert.ok(row.suggestions.some((suggestion) => suggestion.kind === "floor"));
    const catalog = data.listings.find((listing) => listing.today?.catalogStatus === "losing")!;
    assert.ok(catalog.suggestions.some((suggestion) => suggestion.label === "Preço p/ ganhar"));
  });
});
