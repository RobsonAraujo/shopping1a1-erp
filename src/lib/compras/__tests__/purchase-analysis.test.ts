import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePerformanceTier,
  computeSuggestedPurchaseQty,
  computePurchaseAnalysis,
  comparePurchaseAnalysisRows,
  supplierPathSegment,
  decodeSupplierParam,
  buildPurchaseAnalysisInputFromRow,
  type PurchaseAnalysisInput,
} from "../purchase-analysis";

describe("computePerformanceTier", () => {
  it("is 'zero' when there were no sales", () => {
    assert.equal(computePerformanceTier(0, 0), "zero");
  });

  it("is 'alta' at/above the altaMin threshold (7/day)", () => {
    assert.equal(computePerformanceTier(98, 7), "alta");
  });

  it("is 'media' between mediaMin and altaMin (3–6/day)", () => {
    assert.equal(computePerformanceTier(42, 3), "media");
    assert.equal(computePerformanceTier(84, 6), "media");
  });

  it("is 'baixa' below mediaMin but with some sales", () => {
    assert.equal(computePerformanceTier(1, 0.5), "baixa");
  });
});

describe("computeSuggestedPurchaseQty", () => {
  it("suggests 0 when there were no sales", () => {
    const result = computeSuggestedPurchaseQty(0, 100, 0);
    assert.deepEqual(result, { suggestedQty: 0, dailyAvg: 0, targetDays: result.targetDays });
  });

  it("computes targetDays as leadTime + full leadTime + buffer by default", () => {
    // salesAverageWindowDays=14, config.leadTimeDays=14, buffer default=30
    const { targetDays } = computeSuggestedPurchaseQty(14, 0, 10);
    assert.equal(targetDays, 10 + 14 + 30);
  });

  it("uses an explicit targetCoverageDaysOverride instead of computing it", () => {
    const { targetDays } = computeSuggestedPurchaseQty(14, 0, 10, 45);
    assert.equal(targetDays, 45);
  });

  it("suggests max(0, ceil(dailyAvg * targetDays) - stock)", () => {
    // dailyAvg = 14/14 = 1/day, targetDays override = 10 => needed = 10
    const result = computeSuggestedPurchaseQty(14, 4, 0, 10);
    assert.equal(result.suggestedQty, 6);
  });

  it("never suggests a negative quantity when stock already covers demand", () => {
    const result = computeSuggestedPurchaseQty(14, 1000, 0, 10);
    assert.equal(result.suggestedQty, 0);
  });

  it("clamps a negative coverageBufferDays to 0", () => {
    const withNegativeBuffer = computeSuggestedPurchaseQty(14, 0, 10, undefined, -100);
    assert.equal(withNegativeBuffer.targetDays, 10 + 14 + 0);
  });
});

function baseInput(overrides: Partial<PurchaseAnalysisInput> = {}): PurchaseAnalysisInput {
  return {
    unitsSoldInWindow: 14,
    totalStock: 10,
    purchaseLeadTimeDays: 0,
    purchaseIsOverdue: false,
    needsPurchaseAttention: false,
    ...overrides,
  };
}

describe("computePurchaseAnalysis", () => {
  it("returns 'urgente' when purchaseIsOverdue is true", () => {
    const result = computePurchaseAnalysis(baseInput({ purchaseIsOverdue: true }));
    assert.equal(result.purchaseStatus, "urgente");
  });

  it("returns 'sem_vendas' when there were no sales, regardless of overdue flags", () => {
    const result = computePurchaseAnalysis(
      baseInput({ unitsSoldInWindow: 0, purchaseIsOverdue: false }),
    );
    assert.equal(result.purchaseStatus, "sem_vendas");
    assert.equal(result.recommendation, "nao_repor");
  });

  it("returns 'evitar' for baixa performance tier", () => {
    // 1 unit sold over 14 days => dailyAvg ~0.07 => baixa tier
    const result = computePurchaseAnalysis(baseInput({ unitsSoldInWindow: 1 }));
    assert.equal(result.performanceTier, "baixa");
    assert.equal(result.purchaseStatus, "evitar");
    assert.equal(result.recommendation, "nao_repor");
  });

  it("returns 'planejar' when needsPurchaseAttention is set for a healthy tier", () => {
    // 98 sold over 14 days => dailyAvg=7 => alta tier
    const result = computePurchaseAnalysis(
      baseInput({ unitsSoldInWindow: 98, needsPurchaseAttention: true, totalStock: 0 }),
    );
    assert.equal(result.performanceTier, "alta");
    assert.equal(result.purchaseStatus, "planejar");
    assert.equal(result.recommendation, "comprar");
  });

  it("returns 'ok' with 'nao_repor' when nothing needs attention", () => {
    const result = computePurchaseAnalysis(
      baseInput({ unitsSoldInWindow: 98, totalStock: 100000 }),
    );
    assert.equal(result.purchaseStatus, "ok");
    assert.equal(result.recommendation, "nao_repor");
  });

  it("recommends 'revisar' for an urgent case with no suggested quantity", () => {
    const result = computePurchaseAnalysis(
      baseInput({ purchaseIsOverdue: true, totalStock: 100000, unitsSoldInWindow: 98 }),
    );
    assert.equal(result.purchaseStatus, "urgente");
    assert.equal(result.suggestedQty, 0);
    assert.equal(result.recommendation, "revisar");
  });

  it("respects a costProfile targetCoverageDays override for suggestedQty/targetDays", () => {
    const result = computePurchaseAnalysis(
      baseInput({
        unitsSoldInWindow: 14,
        totalStock: 0,
        costProfile: { targetCoverageDays: 20 },
      }),
    );
    assert.equal(result.targetDays, 20);
    assert.equal(result.suggestedQty, 20); // dailyAvg=1 * 20 days
  });
});

describe("buildPurchaseAnalysisInputFromRow", () => {
  it("maps row fields into a PurchaseAnalysisInput", () => {
    const input = buildPurchaseAnalysisInputFromRow(
      {
        unitsSold: 10,
        totalStock: 5,
        purchaseLeadTimeDays: 3,
        plan: { purchaseIsOverdue: true, needsPurchaseAttention: false },
        targetCoverageDays: 25,
      },
      15,
    );
    assert.deepEqual(input, {
      unitsSoldInWindow: 10,
      totalStock: 5,
      purchaseLeadTimeDays: 3,
      purchaseIsOverdue: true,
      needsPurchaseAttention: false,
      costProfile: { targetCoverageDays: 25 },
      coverageBufferDays: 15,
    });
  });
});

describe("comparePurchaseAnalysisRows", () => {
  it("sorts overdue rows first", () => {
    const rows = [
      { purchaseIsOverdue: false, unitsSoldInWindow: 100, suggestedQty: 100 },
      { purchaseIsOverdue: true, unitsSoldInWindow: 1, suggestedQty: 1 },
    ];
    const sorted = [...rows].sort(comparePurchaseAnalysisRows);
    assert.equal(sorted[0].purchaseIsOverdue, true);
  });

  it("breaks ties by unitsSoldInWindow descending", () => {
    const rows = [
      { purchaseIsOverdue: false, unitsSoldInWindow: 5, suggestedQty: 1 },
      { purchaseIsOverdue: false, unitsSoldInWindow: 50, suggestedQty: 1 },
    ];
    const sorted = [...rows].sort(comparePurchaseAnalysisRows);
    assert.equal(sorted[0].unitsSoldInWindow, 50);
  });

  it("finally breaks ties by suggestedQty descending", () => {
    const rows = [
      { purchaseIsOverdue: false, unitsSoldInWindow: 5, suggestedQty: 1 },
      { purchaseIsOverdue: false, unitsSoldInWindow: 5, suggestedQty: 9 },
    ];
    const sorted = [...rows].sort(comparePurchaseAnalysisRows);
    assert.equal(sorted[0].suggestedQty, 9);
  });
});

describe("supplierPathSegment / decodeSupplierParam", () => {
  it("round-trips a supplier name with special characters", () => {
    const encoded = supplierPathSegment("MXT & Cia/Filial");
    assert.equal(decodeSupplierParam(encoded), "MXT & Cia/Filial");
  });
});
