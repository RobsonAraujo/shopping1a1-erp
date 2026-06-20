import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesFullShipmentViewPeriod,
  shipmentShippedAtInCalendarMonth,
} from "./full-shipment-period";

describe("shipmentShippedAtInCalendarMonth", () => {
  it("uses America/Sao_Paulo calendar month, not UTC", () => {
    assert.equal(
      shipmentShippedAtInCalendarMonth(
        "2026-06-04T06:45:31.000Z",
        2026,
        6,
      ),
      true,
    );
    assert.equal(
      shipmentShippedAtInCalendarMonth(
        "2026-05-30T17:31:25.000Z",
        2026,
        6,
      ),
      false,
    );
  });
});

describe("matchesFullShipmentViewPeriod", () => {
  it("matches ml_billing by coleta date (shippedAt), not billing period", () => {
    const shipment = {
      source: "ml_billing" as const,
      billingYear: 2026,
      billingMonth: 6,
      shippedAt: "2026-05-12T11:40:39.000Z",
    };

    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 5), true);
    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 6), false);
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

  it("matches legacy ml_billing by shippedAt when billing period is missing", () => {
    const shipment = {
      source: "ml_billing" as const,
      billingYear: null,
      billingMonth: null,
      shippedAt: "2026-05-12T11:40:39.000Z",
    };

    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 5), true);
    assert.equal(matchesFullShipmentViewPeriod(shipment, 2026, 6), false);
  });
});
