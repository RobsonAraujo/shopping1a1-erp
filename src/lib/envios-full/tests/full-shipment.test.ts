import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCostPerUnit,
  finalizeShipmentPatch,
  FullShipmentValidationError,
  normalizeFullShipmentInput,
  normalizeImportedShipmentInput,
} from "../full-shipment";

describe("computeCostPerUnit", () => {
  it("divides total cost by units", () => {
    assert.equal(computeCostPerUnit(600, 300), 2);
  });

  it("rejects zero units", () => {
    assert.throws(
      () => computeCostPerUnit(600, 0),
      FullShipmentValidationError,
    );
  });

  it("rejects negative cost", () => {
    assert.throws(
      () => computeCostPerUnit(-1, 10),
      FullShipmentValidationError,
    );
  });
});

describe("normalizeFullShipmentInput", () => {
  it("computes cost per unit on create", () => {
    const normalized = normalizeFullShipmentInput({
      shippedAt: new Date("2026-06-20T12:00:00.000Z"),
      totalCost: 600,
      totalUnits: 300,
      notes: "  teste ",
    });
    assert.equal(normalized.totalCost, 600);
    assert.equal(normalized.totalUnits, 300);
    assert.equal(normalized.costPerUnit, 2);
    assert.equal(normalized.notes, "teste");
    assert.equal(normalized.source, "manual");
  });
});

describe("normalizeImportedShipmentInput", () => {
  it("computes cost per unit when units are provided", () => {
    const normalized = normalizeImportedShipmentInput({
      shippedAt: new Date("2026-06-19T12:00:00.000Z"),
      totalCost: 600,
      totalUnits: 300,
      productCount: 12,
      mlInboundId: "69719031",
      mlChargeDetailId: "111",
      billingYear: 2026,
      billingMonth: 6,
      notes: "Envio N.º 69719031",
    });
    assert.equal(normalized.totalUnits, 300);
    assert.equal(normalized.costPerUnit, 2);
    assert.equal(normalized.mlInboundId, "69719031");
    assert.equal(normalized.productCount, 12);
    assert.equal(normalized.billingYear, 2026);
    assert.equal(normalized.billingMonth, 6);
  });
});

describe("finalizeShipmentPatch", () => {
  it("keeps zero cost per unit when units are zero", () => {
    const result = finalizeShipmentPatch(
      { totalCost: 600, totalUnits: 0 },
      { totalUnits: 0 },
    );
    assert.equal(result.costPerUnit, 0);
  });

  it("recalculates after units update", () => {
    const result = finalizeShipmentPatch(
      { totalCost: 600, totalUnits: 0 },
      { totalUnits: 300 },
    );
    assert.equal(result.costPerUnit, 2);
  });
});
