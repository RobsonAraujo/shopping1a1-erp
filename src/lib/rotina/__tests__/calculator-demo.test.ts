import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEMO_FREE_SHIPPING_FROM,
  DEMO_LISTINGS,
  buildDemoCalculatorData,
  createDemoCalculatorApi,
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

  it("reads and simulates locally, with the panel's margin math", async () => {
    const api = createDemoCalculatorApi();
    const reading = await api.read(kit.mlItemId);
    assert.equal(reading.price, kit.salePrice);
    assert.equal(reading.ads.basis, "today");
    assert.equal(reading.ads.tacosPercent, kit.tacosTodayPercent);

    const simulator = api.simulatorFor(reading, reading.ads);
    const simulation = await simulator.simulate({ mlItemId: kit.mlItemId, prices: [78.9, 80] });
    assert.equal(simulation.inputsFrom, "demo");
    const [below, above] = simulation.results;
    // O degrau dos R$ 79: acima dele o frete grátis come a margem.
    assert.ok((below.marginAfterAdsPercent ?? 0) > (above.marginAfterAdsPercent ?? 0) + 10);

    const floor = await simulator.floor({ mlItemId: kit.mlItemId, targetPercent: 15 });
    assert.equal(floor.targetPercent, 15);
    assert.equal(
      floor.floor?.effectivePrice,
      demoFloorView(kit, "gold_pro", 15, kit.tacosTodayPercent).effectivePrice,
    );
  });

  it("switches to the 7-day TACOS: the after-ADS margin follows it", async () => {
    const api = createDemoCalculatorApi();
    const reading = await api.read(kit.mlItemId);
    const week = await api.ads7d(kit.mlItemId);
    assert.equal(week.basis, "7d");
    assert.equal(week.tacosPercent, kit.tacosPercent);
    const [today] = (await api.simulatorFor(reading, reading.ads).simulate({ mlItemId: kit.mlItemId, prices: [84.9] })).results;
    const [sevenDays] = (await api.simulatorFor(reading, week).simulate({ mlItemId: kit.mlItemId, prices: [84.9] })).results;
    assert.equal(today.marginPercent, sevenDays.marginPercent);
    assert.equal(
      Math.round(((today.marginAfterAdsPercent ?? 0) - (sevenDays.marginAfterAdsPercent ?? 0)) * 100) / 100,
      Math.round((kit.tacosPercent - kit.tacosTodayPercent) * 100) / 100,
    );
  });

  it("builds the listing directory without numbers: they come from the reading", () => {
    const data = buildDemoCalculatorData();
    assert.equal(data.listings.length, DEMO_LISTINGS.length);
    const row = data.listings.find((listing) => listing.mlItemId === kit.mlItemId)!;
    assert.equal(row.title, kit.title);
    assert.equal("today" in row, false);
  });
});
