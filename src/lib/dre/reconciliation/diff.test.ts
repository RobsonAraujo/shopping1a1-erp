import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReconciliationDiff } from "./diff";
import type { ReconciliationLineAggregation } from "./types";
import type { DreMonthSnapshotPayload } from "@/lib/dre/dre-calculations";

function payload(overrides: Partial<DreMonthSnapshotPayload> = {}): DreMonthSnapshotPayload {
  return {
    revenueMl: 0,
    cancelledSalesMl: 0,
    saleFeeMl: 0,
    partialReturnsMl: 0,
    returnFeeMl: 0,
    specialFeesMl: 0,
    productCostErp: 0,
    taxErp: 0,
    sellerShippingMl: 0,
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
    minhaPaginaMl: 0,
    affiliateFeeMl: 0,
    adsCost: 0,
    billingSource: "billing",
    isPartial: false,
    incompleteProductCostCount: 0,
    syncWarnings: [],
    ...overrides,
  };
}

function aggregation(
  amounts: ReconciliationLineAggregation["amounts"],
): ReconciliationLineAggregation {
  return { amounts, breakdowns: {}, unrecognizedFees: [], warnings: [] };
}

describe("buildReconciliationDiff", () => {
  it("skips lines that are never eligible for reconciliation (productCostErp/taxErp/adsCost/fullShippingMl/revenueMl/cancelledSalesMl/partialReturnsMl)", () => {
    const diffs = buildReconciliationDiff(
      payload(),
      aggregation({
        productCostErp: 999,
        taxErp: 999,
        adsCost: 999,
        fullShippingMl: 999,
        revenueMl: 999,
        cancelledSalesMl: 999,
        partialReturnsMl: 999,
      }),
    );
    assert.deepEqual(diffs, []);
  });

  it("skips a line whose proposed amount matches the current one within rounding noise", () => {
    const diffs = buildReconciliationDiff(
      payload({ saleFeeMl: -100 }),
      aggregation({ saleFeeMl: -100.003 }),
    );
    assert.deepEqual(diffs, []);
  });

  it("includes a line with a real difference, computing label/currentAmount/proposedAmount/delta", () => {
    const diffs = buildReconciliationDiff(
      payload({ saleFeeMl: -100 }),
      aggregation({ saleFeeMl: -120 }),
    );
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].lineKey, "saleFeeMl");
    assert.equal(diffs[0].label, "Tarifa ML");
    assert.equal(diffs[0].currentAmount, -100);
    assert.equal(diffs[0].proposedAmount, -120);
    assert.equal(diffs[0].delta, -20);
  });

  it("treats a null currentPayload as all-zero current amounts", () => {
    const diffs = buildReconciliationDiff(null, aggregation({ saleFeeMl: -50 }));
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].currentAmount, 0);
    assert.equal(diffs[0].proposedAmount, -50);
  });

  it("sorts diffs alphabetically by label (pt-BR)", () => {
    const diffs = buildReconciliationDiff(
      payload(),
      aggregation({
        sellerShippingMl: -10, // "Frete vendedor"
        saleFeeMl: -10, // "Tarifa ML"
        returnFeeMl: -10, // "Tarifa de devolução"
      }),
    );
    assert.deepEqual(
      diffs.map((d) => d.label),
      ["Frete vendedor", "Tarifa de devolução", "Tarifa ML"],
    );
  });
});
