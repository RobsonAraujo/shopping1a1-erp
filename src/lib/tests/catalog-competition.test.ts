import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayKeyInTimezone,
  catalogPricesEqual,
  catalogPricesChanged,
  shouldRecordCatalogSnapshot,
  normalizeCompetitionStatus,
  deriveStatusFromPriceToWin,
  parseMoneyValue,
  extractPriceToWin,
  extractSellerPrice,
  decimalToNumber,
  extractSellerPriceFromRawResponse,
  buildTimeline,
  formatCatalogMoney,
  catalogStatusLabel,
  catalogStatusBadgeClass,
  catalogPriceGap,
  type LatestCatalogSnapshot,
  type CompetitionPoint,
} from "../catalog-competition";

const TZ = "America/Sao_Paulo";

describe("dayKeyInTimezone", () => {
  it("formats as YYYY-MM-DD in the given timezone", () => {
    assert.equal(dayKeyInTimezone(new Date("2026-06-15T12:00:00Z"), TZ), "2026-06-15");
  });

  it("rolls over to the previous day near midnight UTC-3", () => {
    assert.equal(dayKeyInTimezone(new Date("2026-06-15T02:00:00Z"), TZ), "2026-06-14");
  });
});

describe("catalogPricesEqual", () => {
  it("treats two nulls as equal", () => {
    assert.equal(catalogPricesEqual(null, null), true);
  });

  it("treats null vs a number as not equal", () => {
    assert.equal(catalogPricesEqual(null, 10), false);
    assert.equal(catalogPricesEqual(10, null), false);
  });

  it("treats values within epsilon as equal", () => {
    assert.equal(catalogPricesEqual(10.001, 10.0011), true);
  });

  it("treats values beyond epsilon as different", () => {
    assert.equal(catalogPricesEqual(10, 10.1), false);
  });
});

describe("catalogPricesChanged", () => {
  const latest: LatestCatalogSnapshot = {
    status: "winning",
    sellerPrice: 100,
    priceToWin: 95,
    snapshotAt: new Date(),
  };

  it("is false when both prices match", () => {
    assert.equal(catalogPricesChanged(latest, 100, 95), false);
  });

  it("is true when sellerPrice changed", () => {
    assert.equal(catalogPricesChanged(latest, 110, 95), true);
  });

  it("is true when priceToWin changed", () => {
    assert.equal(catalogPricesChanged(latest, 100, 90), true);
  });
});

describe("shouldRecordCatalogSnapshot", () => {
  it("always records when there's no prior snapshot", () => {
    assert.equal(
      shouldRecordCatalogSnapshot({
        latest: null,
        polledAt: new Date(),
        status: "winning",
        sellerPrice: 10,
        priceToWin: 9,
      }),
      true,
    );
  });

  it("records when status changed", () => {
    const latest: LatestCatalogSnapshot = {
      status: "losing",
      sellerPrice: 10,
      priceToWin: 9,
      snapshotAt: new Date("2026-06-15T12:00:00Z"),
    };
    assert.equal(
      shouldRecordCatalogSnapshot({
        latest,
        polledAt: new Date("2026-06-15T12:05:00Z"),
        status: "winning",
        sellerPrice: 10,
        priceToWin: 9,
        timeZone: TZ,
      }),
      true,
    );
  });

  it("records when the calendar day rolled over even with the same status/price", () => {
    const latest: LatestCatalogSnapshot = {
      status: "winning",
      sellerPrice: 10,
      priceToWin: 9,
      snapshotAt: new Date("2026-06-14T12:00:00Z"),
    };
    assert.equal(
      shouldRecordCatalogSnapshot({
        latest,
        polledAt: new Date("2026-06-15T12:00:00Z"),
        status: "winning",
        sellerPrice: 10,
        priceToWin: 9,
        timeZone: TZ,
      }),
      true,
    );
  });

  it("does not record when nothing changed within the same day", () => {
    const latest: LatestCatalogSnapshot = {
      status: "winning",
      sellerPrice: 10,
      priceToWin: 9,
      snapshotAt: new Date("2026-06-15T10:00:00Z"),
    };
    assert.equal(
      shouldRecordCatalogSnapshot({
        latest,
        polledAt: new Date("2026-06-15T12:00:00Z"),
        status: "winning",
        sellerPrice: 10,
        priceToWin: 9,
        timeZone: TZ,
      }),
      false,
    );
  });

  it("records when prices changed within the same day", () => {
    const latest: LatestCatalogSnapshot = {
      status: "winning",
      sellerPrice: 10,
      priceToWin: 9,
      snapshotAt: new Date("2026-06-15T10:00:00Z"),
    };
    assert.equal(
      shouldRecordCatalogSnapshot({
        latest,
        polledAt: new Date("2026-06-15T12:00:00Z"),
        status: "winning",
        sellerPrice: 11,
        priceToWin: 9,
        timeZone: TZ,
      }),
      true,
    );
  });
});

describe("normalizeCompetitionStatus", () => {
  it("maps known literal values", () => {
    assert.equal(normalizeCompetitionStatus("winning"), "winning");
    assert.equal(normalizeCompetitionStatus("competing"), "losing");
    assert.equal(normalizeCompetitionStatus("losing"), "losing");
    assert.equal(normalizeCompetitionStatus("sharing_first_place"), "shared");
    assert.equal(normalizeCompetitionStatus("shared"), "shared");
  });

  it("is case/whitespace insensitive", () => {
    assert.equal(normalizeCompetitionStatus("  WINNING  "), "winning");
  });

  it("falls back to substring matching for payload variations", () => {
    assert.equal(normalizeCompetitionStatus("is_sharing_something"), "shared");
    assert.equal(normalizeCompetitionStatus("still_competing_hard"), "losing");
    assert.equal(normalizeCompetitionStatus("currently_winning_now"), "winning");
  });

  it("returns 'unknown' for non-strings or unrecognized text", () => {
    assert.equal(normalizeCompetitionStatus(42), "unknown");
    assert.equal(normalizeCompetitionStatus(null), "unknown");
    assert.equal(normalizeCompetitionStatus("gibberish"), "unknown");
  });
});

describe("deriveStatusFromPriceToWin", () => {
  it("uses payload.status when present", () => {
    assert.equal(deriveStatusFromPriceToWin({ status: "winning" }), "winning");
  });

  it("falls back to alternate keys", () => {
    assert.equal(
      deriveStatusFromPriceToWin({ competition_status: "losing" }),
      "losing",
    );
    assert.equal(
      deriveStatusFromPriceToWin({ winning_status: "winning" }),
      "winning",
    );
  });

  it("falls back to visit_share heuristics", () => {
    assert.equal(deriveStatusFromPriceToWin({ visit_share: "maximum" }), "winning");
    assert.equal(deriveStatusFromPriceToWin({ visit_share: "minimum" }), "losing");
    assert.equal(deriveStatusFromPriceToWin({ visit_share: "medium" }), "shared");
  });

  it("returns unknown when nothing matches", () => {
    assert.equal(deriveStatusFromPriceToWin({}), "unknown");
  });
});

describe("parseMoneyValue", () => {
  it("passes through finite numbers", () => {
    assert.equal(parseMoneyValue(10.5), 10.5);
  });

  it("parses numeric strings, including comma decimal separator", () => {
    assert.equal(parseMoneyValue("10.5"), 10.5);
    assert.equal(parseMoneyValue("10,5"), 10.5);
  });

  it("extracts from an { amount } object recursively", () => {
    assert.equal(parseMoneyValue({ amount: 20 }), 20);
    assert.equal(parseMoneyValue({ amount: "20,5" }), 20.5);
  });

  it("returns null for unparsable values", () => {
    assert.equal(parseMoneyValue("not a number"), null);
    assert.equal(parseMoneyValue(undefined), null);
    assert.equal(parseMoneyValue({}), null);
  });
});

describe("extractPriceToWin", () => {
  it("checks candidates in priority order", () => {
    assert.equal(extractPriceToWin({ price_to_win: 10, price: 99 }), 10);
    assert.equal(extractPriceToWin({ priceToWin: 20, price: 99 }), 20);
    assert.equal(extractPriceToWin({ target_price: 30, price: 99 }), 30);
    assert.equal(extractPriceToWin({ price: 40 }), 40);
  });

  it("returns null when no candidate parses", () => {
    assert.equal(extractPriceToWin({}), null);
  });
});

describe("extractSellerPrice", () => {
  it("prefers pricePayload.current_price over item.price", () => {
    assert.equal(
      extractSellerPrice({ current_price: 15 }, { price: 99 }),
      15,
    );
  });

  it("falls back to item.price when pricePayload has no usable field", () => {
    assert.equal(extractSellerPrice({}, { price: 99 }), 99);
    assert.equal(extractSellerPrice(null, { price: 99 }), 99);
  });

  it("returns null when neither source has a price", () => {
    assert.equal(extractSellerPrice(null, null), null);
  });
});

describe("decimalToNumber", () => {
  it("converts numeric-like values", () => {
    assert.equal(decimalToNumber("10.5"), 10.5);
    assert.equal(decimalToNumber(10), 10);
  });

  it("returns null for null/undefined/non-numeric", () => {
    assert.equal(decimalToNumber(null), null);
    assert.equal(decimalToNumber(undefined), null);
    assert.equal(decimalToNumber("abc"), null);
  });
});

describe("extractSellerPriceFromRawResponse", () => {
  it("prefers the stored seller price when present", () => {
    assert.equal(extractSellerPriceFromRawResponse({}, 42), 42);
  });

  it("falls back to raw response's priceToWin/item payload", () => {
    const result = extractSellerPriceFromRawResponse(
      { priceToWin: { current_price: 33 } },
      null,
    );
    assert.equal(result, 33);
  });

  it("returns null when rawResponse is not an object and storedSellerPrice is unusable", () => {
    assert.equal(extractSellerPriceFromRawResponse(null, null), null);
  });
});

describe("buildTimeline", () => {
  const from = new Date("2026-06-15T00:00:00Z");
  const to = new Date("2026-06-15T03:00:00Z");

  it("returns empty intervals/zeroed totals for no points", () => {
    const { intervals, totals } = buildTimeline([], from, to);
    assert.deepEqual(intervals, []);
    assert.deepEqual(totals, { winning: 0, losing: 0, shared: 0, unknown: 0 });
  });

  it("excludes points outside the [from, to] window", () => {
    const points: CompetitionPoint[] = [
      {
        at: new Date("2026-06-14T00:00:00Z"),
        status: "winning",
        sellerPrice: 10,
        priceToWin: 9,
        source: "event",
      },
    ];
    const { intervals } = buildTimeline(points, from, to);
    assert.equal(intervals.length, 0);
  });

  it("builds sequential intervals ending at the next point's time, last one ending at 'to'", () => {
    const points: CompetitionPoint[] = [
      { at: new Date("2026-06-15T00:00:00Z"), status: "winning", sellerPrice: 10, priceToWin: 9, source: "event" },
      { at: new Date("2026-06-15T01:00:00Z"), status: "losing", sellerPrice: 8, priceToWin: 9, source: "event" },
    ];
    const { intervals, totals } = buildTimeline(points, from, to);
    assert.equal(intervals.length, 2);
    assert.equal(intervals[0].minutes, 60);
    assert.equal(intervals[1].minutes, 120);
    assert.equal(intervals[1].to, to.toISOString());
    assert.equal(totals.winning, 60);
    assert.equal(totals.losing, 120);
  });

  it("sorts out-of-order points by time before building intervals", () => {
    const points: CompetitionPoint[] = [
      { at: new Date("2026-06-15T01:00:00Z"), status: "losing", sellerPrice: 8, priceToWin: 9, source: "event" },
      { at: new Date("2026-06-15T00:00:00Z"), status: "winning", sellerPrice: 10, priceToWin: 9, source: "event" },
    ];
    const { intervals } = buildTimeline(points, from, to);
    assert.equal(intervals[0].status, "winning");
  });
});

describe("formatCatalogMoney", () => {
  it("formats a number as BRL currency", () => {
    assert.match(formatCatalogMoney(10.5) ?? "", /R\$/);
  });

  it("returns null for null input", () => {
    assert.equal(formatCatalogMoney(null), null);
  });
});

describe("catalogStatusLabel", () => {
  it("maps every status to a pt-BR label", () => {
    assert.equal(catalogStatusLabel("winning"), "Ganhando");
    assert.equal(catalogStatusLabel("losing"), "Perdendo");
    assert.equal(catalogStatusLabel("shared"), "Compartilhando");
    assert.equal(catalogStatusLabel("unknown"), "Sem sinal");
  });
});

describe("catalogStatusBadgeClass", () => {
  it("returns distinct classes per status and a neutral default", () => {
    assert.match(catalogStatusBadgeClass("winning"), /emerald/);
    assert.match(catalogStatusBadgeClass("losing"), /rose/);
    assert.match(catalogStatusBadgeClass("shared"), /amber/);
    assert.match(catalogStatusBadgeClass(null), /muted/);
    assert.match(catalogStatusBadgeClass("unknown"), /muted/);
  });
});

describe("catalogPriceGap", () => {
  it("computes seller price minus price to win, rounded to 2 decimals", () => {
    assert.equal(catalogPriceGap(10.567, 9), 1.57);
  });

  it("returns null when either price is missing", () => {
    assert.equal(catalogPriceGap(null, 9), null);
    assert.equal(catalogPriceGap(10, null), null);
  });
});
