import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectZeroLineAnomalies,
  type DreAnomalyMonthInput,
} from "../dre-line-anomalies";
import type { DreLineAmounts } from "../dre-calculations";

function lines(overrides: Partial<DreLineAmounts> = {}): DreLineAmounts {
  return {
    revenueMl: 100_000,
    cancelledSalesMl: -5_000,
    saleFeeMl: -12_000,
    partialReturnsMl: 0,
    returnFeeMl: 0,
    specialFeesMl: 0,
    productCostErp: -50_000,
    taxErp: -7_000,
    sellerShippingMl: -15_000,
    fullShippingMl: 0,
    fullStorageMl: 0,
    fullNonComplianceMl: 0,
    minhaPaginaMl: 0,
    affiliateFeeMl: 0,
    ...overrides,
  };
}

function month(
  m: number,
  overrides: Partial<DreAnomalyMonthInput> = {},
): DreAnomalyMonthInput {
  return {
    month: m,
    lines: lines(),
    isCurrentMonth: false,
    syncedAt: "2026-10-01T00:00:00.000Z",
    manuallyEditedLineKeys: [],
    ...overrides,
  };
}

const NOW = new Date("2026-10-20T15:00:00.000Z");

describe("detectZeroLineAnomalies", () => {
  it("flags Canceladas = 0 in a month with sales when the other months usually have ~5%", () => {
    const result = detectZeroLineAnomalies(
      [month(6), month(7), month(8, { lines: lines({ cancelledSalesMl: 0 }) })],
      { now: NOW },
    );
    assert.deepEqual(result.get(8), [
      { lineKey: "cancelledSalesMl", typicalPercent: 5, expectedAmount: 5000 },
    ]);
    assert.equal(result.has(6), false);
  });

  it("does not alert a seller that rarely has cancellations (median stays at zero)", () => {
    const result = detectZeroLineAnomalies(
      [
        month(5, { lines: lines({ cancelledSalesMl: 0 }) }),
        month(6, { lines: lines({ cancelledSalesMl: 0 }) }),
        month(7, { lines: lines({ cancelledSalesMl: -3_000 }) }),
        month(8, { lines: lines({ cancelledSalesMl: 0 }) }),
      ],
      { now: NOW },
    );
    assert.equal(result.size, 0);
  });

  it("needs at least two months of history", () => {
    const result = detectZeroLineAnomalies(
      [month(7), month(8, { lines: lines({ cancelledSalesMl: 0 }) })],
      { now: NOW },
    );
    assert.equal(result.size, 0);
  });

  it("waits until day 10 of the current month — cancellations arrive late", () => {
    const current = month(10, {
      isCurrentMonth: true,
      lines: lines({ cancelledSalesMl: 0, revenueMl: 30_000 }),
    });
    const early = detectZeroLineAnomalies([month(8), month(9), current], {
      now: new Date("2026-10-05T15:00:00.000Z"),
    });
    assert.equal(early.size, 0);
    const later = detectZeroLineAnomalies([month(8), month(9), current], {
      now: NOW,
    });
    assert.equal(later.get(10)?.[0]?.lineKey, "cancelledSalesMl");
  });

  it("skips a zero the user typed in on purpose and small expected amounts", () => {
    const edited = detectZeroLineAnomalies(
      [
        month(6),
        month(7),
        month(8, {
          lines: lines({ cancelledSalesMl: 0 }),
          manuallyEditedLineKeys: ["cancelledSalesMl"],
        }),
      ],
      { now: NOW },
    );
    assert.equal(edited.size, 0);

    const tiny = detectZeroLineAnomalies(
      [month(6), month(7), month(8, { lines: lines({ cancelledSalesMl: 0, revenueMl: 1_000 }) })],
      { now: NOW },
    );
    assert.equal(tiny.size, 0);
  });

  it("also covers Tarifa ML and Frete vendedor", () => {
    const result = detectZeroLineAnomalies(
      [
        month(6),
        month(7),
        month(8, { lines: lines({ saleFeeMl: 0, sellerShippingMl: 0 }) }),
      ],
      { now: NOW },
    );
    assert.deepEqual(
      result.get(8)?.map((a) => a.lineKey),
      ["saleFeeMl", "sellerShippingMl"],
    );
  });
});
