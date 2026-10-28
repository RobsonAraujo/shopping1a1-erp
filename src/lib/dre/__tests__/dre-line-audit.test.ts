import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkLineAuditConsistency, lineAuditSum } from "../dre-line-audit";
import type { DreMonthSnapshotPayload } from "../dre-calculations";

function payload(
  overrides: Partial<DreMonthSnapshotPayload> = {},
): DreMonthSnapshotPayload {
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
    billingSource: "fallback",
    isPartial: false,
    incompleteProductCostCount: 0,
    syncWarnings: [],
    ...overrides,
  };
}

const line = (amount: number) => ({
  key: `item:${amount}`,
  sku: null,
  title: "x",
  quantity: 1,
  amount,
});

describe("checkLineAuditConsistency", () => {
  it("flags a line that came back zero while its audit lists orders (the reported Canceladas bug)", () => {
    const mismatches = checkLineAuditConsistency(
      payload({
        cancelledSalesMl: 0,
        cancelledSalesBreakdown: [line(-1200), line(-300)],
      }),
    );
    assert.deepEqual(mismatches, [
      {
        lineKey: "cancelledSalesMl",
        value: 0,
        auditSum: -1500,
        kind: "zero_with_audit",
      },
    ]);
  });

  it("flags a non-zero line that the audit does not explain", () => {
    const mismatches = checkLineAuditConsistency(
      payload({
        specialFeesMl: -807.94,
        specialFeesBreakdown: [line(-305.53)],
      }),
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0]?.kind, "differs");
  });

  it("accepts rounding noise and the ML invoice's inverted sign for ads", () => {
    const mismatches = checkLineAuditConsistency(
      payload({
        saleFeeMl: -1000,
        saleFeeBreakdown: [line(-600.004), line(-400)],
        adsCost: 1986.47,
        adsCostBreakdown: [line(1986.47)],
      }),
    );
    assert.deepEqual(mismatches, []);
  });

  it("compares Faturamento with the gross the screen shows (paid + cancelled)", () => {
    const mismatches = checkLineAuditConsistency(
      payload({
        revenueMl: 1000,
        cancelledIncludeOverlay: { revenueGross: 200, productCostErp: 0, taxErp: 0 },
        revenueBreakdown: [line(900), { ...line(300), cancelledAmount: 200 }],
      }),
    );
    assert.deepEqual(mismatches, []);
  });

  it("skips lines whose value comes from a manual edit or the reconciliation sheet", () => {
    const mismatches = checkLineAuditConsistency(
      payload({
        saleFeeMl: -50,
        saleFeeBreakdown: [line(-999)],
        returnFeeMl: -10,
        returnFeeBreakdown: [line(-999)],
        manuallyEditedLineKeys: ["saleFeeMl"],
        reconciliation: {
          importId: "imp",
          reconciledAt: "",
          fileName: "f.xlsx",
          lineKeys: ["returnFeeMl"],
          amounts: { returnFeeMl: -10 },
        },
      }),
    );
    assert.deepEqual(mismatches, []);
  });

  it("ignores lines without an audit list", () => {
    assert.equal(lineAuditSum(payload({ fullShippingMl: -200 }), "fullShippingMl"), null);
    assert.deepEqual(checkLineAuditConsistency(payload({ fullShippingMl: -200 })), []);
  });

  it("applies the same zero floor as the tax line when products net to a credit", () => {
    const mismatches = checkLineAuditConsistency(
      payload({
        taxErp: 0,
        taxBreakdown: [
          {
            key: "item:A",
            sku: null,
            title: "A",
            quantity: 1,
            revenue: 100,
            taxPercent: -5,
            totalTax: -5,
            missingTax: false,
          },
        ],
      }),
    );
    assert.deepEqual(mismatches, []);
  });
});
