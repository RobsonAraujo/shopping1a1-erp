import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyDreMonthSnapshotPayload,
  parseSnapshotPayload,
  snapshotPayloadToLines,
} from "../dre-month-data";
import type { DreEditableLineKey } from "../dre-calculations";

describe("emptyDreMonthSnapshotPayload", () => {
  it("returns a fully-zeroed payload with a fallback-source warning", () => {
    const payload = emptyDreMonthSnapshotPayload();
    assert.equal(payload.revenueMl, 0);
    assert.equal(payload.productCostErp, 0);
    assert.equal(payload.adsCost, 0);
    assert.equal(payload.billingSource, "fallback");
    assert.equal(payload.isPartial, false);
    assert.equal(payload.incompleteProductCostCount, 0);
    assert.equal(payload.fullReportSourced, false);
    assert.deepEqual(payload.syncWarnings, [
      "Valores preenchidos manualmente (ainda sem sincronização completa).",
    ]);
  });
});

describe("snapshotPayloadToLines", () => {
  it("projects only the DreLineAmounts fields, dropping metadata/breakdowns", () => {
    const payload = {
      ...emptyDreMonthSnapshotPayload(),
      revenueMl: 1000,
      saleFeeMl: -50,
      productCostBreakdown: [
        { key: "a", sku: "A", title: "A", quantity: 1, unitCost: 1, totalCost: 1, missingCost: false },
      ],
      manuallyEditedLineKeys: ["revenueMl"] as DreEditableLineKey[],
    };
    const lines = snapshotPayloadToLines(payload);
    assert.equal(lines.revenueMl, 1000);
    assert.equal(lines.saleFeeMl, -50);
    assert.equal("adsCost" in lines, false);
    assert.equal("billingSource" in lines, false);
    assert.equal("productCostBreakdown" in lines, false);
    assert.equal("manuallyEditedLineKeys" in lines, false);
  });
});

describe("parseSnapshotPayload", () => {
  it("returns null for null/undefined/non-object input", () => {
    assert.equal(parseSnapshotPayload(null), null);
    assert.equal(parseSnapshotPayload(undefined), null);
    assert.equal(parseSnapshotPayload("a string"), null);
    assert.equal(parseSnapshotPayload(42), null);
  });

  it("defaults every field for an empty object (legacy/never-synced payload)", () => {
    const parsed = parseSnapshotPayload({});
    assert.ok(parsed);
    assert.equal(parsed.revenueMl, 0);
    assert.equal(parsed.productCostErp, 0);
    assert.equal(parsed.adsCost, 0);
    assert.equal(parsed.billingSource, "fallback");
    assert.equal(parsed.isPartial, false);
    assert.equal(parsed.incompleteProductCostCount, 0);
    assert.deepEqual(parsed.syncWarnings, []);
    assert.equal(parsed.fullReportSourced, false);
    assert.equal(parsed.hasRealSyncBaseline, false);
    // Legacy payloads have none of these fields at all — must stay undefined,
    // not default to an empty object/array (the UI distinguishes "never
    // synced" from "synced with nothing edited").
    assert.equal(parsed.syncedLineBaseline, undefined);
    assert.equal(parsed.syncedBreakdownBaseline, undefined);
    assert.equal(parsed.manuallyEditedLineKeys, undefined);
    assert.equal(parsed.productCostBreakdown, undefined);
    assert.equal(parsed.cancelledIncludeOverlay, undefined);
  });

  it("coerces numeric-looking strings but defaults non-numeric strings to 0", () => {
    const parsed = parseSnapshotPayload({ revenueMl: "1500", saleFeeMl: "not-a-number" });
    assert.ok(parsed);
    assert.equal(parsed.revenueMl, 1500);
    assert.equal(parsed.saleFeeMl, 0);
  });

  it("only accepts billingSource: 'billing' literally, defaulting anything else to 'fallback'", () => {
    assert.equal(parseSnapshotPayload({ billingSource: "billing" })?.billingSource, "billing");
    assert.equal(parseSnapshotPayload({ billingSource: "weird" })?.billingSource, "fallback");
    assert.equal(parseSnapshotPayload({})?.billingSource, "fallback");
  });

  it("treats a non-array value for a breakdown field as absent, not an error", () => {
    const parsed = parseSnapshotPayload({
      productCostBreakdown: "not-an-array",
      taxBreakdown: { not: "an array either" },
      revenueBreakdown: null,
    });
    assert.ok(parsed);
    assert.equal(parsed.productCostBreakdown, undefined);
    assert.equal(parsed.taxBreakdown, undefined);
    assert.equal(parsed.revenueBreakdown, undefined);
  });

  it("filters non-object entries out of a breakdown array and defaults missing fields", () => {
    const parsed = parseSnapshotPayload({
      productCostBreakdown: [
        { sku: "SKU-A", quantity: "3", unitCost: 10, totalCost: 30 },
        "garbage-entry",
        null,
        { key: "item:MLB2", sku: "SKU-B", title: "Produto B", quantity: 1, unitCost: 5, totalCost: 5, missingCost: true, leveled: true },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed.productCostBreakdown?.length, 2);
    // First entry: no `key`, falls back to `sku`.
    assert.equal(parsed.productCostBreakdown?.[0].key, "SKU-A");
    assert.equal(parsed.productCostBreakdown?.[0].quantity, 3);
    assert.equal(parsed.productCostBreakdown?.[0].missingCost, false);
    assert.equal(parsed.productCostBreakdown?.[0].leveled, undefined);
    // Second entry: explicit key/leveled preserved.
    assert.equal(parsed.productCostBreakdown?.[1].key, "item:MLB2");
    assert.equal(parsed.productCostBreakdown?.[1].leveled, true);
  });

  it("parses cancelledIncludeOverlay when present as an object, ignores it when malformed", () => {
    const withOverlay = parseSnapshotPayload({
      cancelledIncludeOverlay: { revenueGross: 100, productCostErp: -20, taxErp: -5 },
    });
    assert.deepEqual(withOverlay?.cancelledIncludeOverlay, {
      revenueGross: 100,
      productCostErp: -20,
      taxErp: -5,
    });

    const arrayOverlay = parseSnapshotPayload({ cancelledIncludeOverlay: [1, 2, 3] });
    assert.equal(arrayOverlay?.cancelledIncludeOverlay, undefined);

    const missingOverlay = parseSnapshotPayload({});
    assert.equal(missingOverlay?.cancelledIncludeOverlay, undefined);
  });

  it("filters manuallyEditedLineKeys to only valid, string editable-line keys", () => {
    const parsed = parseSnapshotPayload({
      manuallyEditedLineKeys: ["revenueMl", "bogusKey", 42, "adsCost", null],
    });
    assert.deepEqual(parsed?.manuallyEditedLineKeys, ["revenueMl", "adsCost"]);
  });

  it("filters syncedLineBaseline entries to only valid editable-line keys and coerces their values", () => {
    const parsed = parseSnapshotPayload({
      syncedLineBaseline: { revenueMl: "1000", bogusKey: 999, adsCost: null },
    });
    assert.deepEqual(parsed?.syncedLineBaseline, { revenueMl: 1000, adsCost: 0 });
  });

  it("filters syncWarnings to only string entries", () => {
    const parsed = parseSnapshotPayload({
      syncWarnings: ["real warning", 42, null, "another warning"],
    });
    assert.deepEqual(parsed?.syncWarnings, ["real warning", "another warning"]);
  });

  it("round-trips a fully-populated payload built by emptyDreMonthSnapshotPayload", () => {
    const original = emptyDreMonthSnapshotPayload();
    const parsed = parseSnapshotPayload(original);
    assert.ok(parsed);
    assert.equal(parsed.revenueMl, original.revenueMl);
    assert.equal(parsed.billingSource, original.billingSource);
    assert.deepEqual(parsed.syncWarnings, original.syncWarnings);
  });
});
