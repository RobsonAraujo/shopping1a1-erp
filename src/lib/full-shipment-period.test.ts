import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesFullShipmentViewPeriod } from "./full-shipment-period";

describe("matchesFullShipmentViewPeriod", () => {
  it("matches ml_billing by billing period, not shippedAt", () => {
    const shipment = {
      source: "ml_billing" as const,
      billingYear: 2026,
      billingMonth: 6,
      shippedAt: "2026-05-12T11:40:39.000Z",
    };

    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 6), true);
    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 5), false);
  });

  it("matches manual shipments by shippedAt month", () => {
    const shipment = {
      source: "manual" as const,
      billingYear: null,
      billingMonth: null,
      shippedAt: "2026-06-15T12:00:00.000Z",
    };

    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 6), true);
    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 5), false);
  });

  it("excludes legacy ml_billing without billing period", () => {
    const shipment = {
      source: "ml_billing" as const,
      billingYear: null,
      billingMonth: null,
      shippedAt: "2026-05-12T11:40:39.000Z",
    };

    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 5), false);
    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 6), false);
  });
});
