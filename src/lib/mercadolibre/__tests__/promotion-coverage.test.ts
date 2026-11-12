import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  promotionCoverage,
  toPromotionWindows,
  type PromotionRecordLike,
} from "../promotion-coverage";

const TZ = "America/Sao_Paulo";

/** 15/11 23:59 em São Paulo (UTC−3). */
const ENDS_15_NIGHT = "2026-11-16T02:59:00.000Z";

function coverage(records: PromotionRecordLike[]) {
  return promotionCoverage(toPromotionWindows(records), TZ);
}

const active = (finish: string, name = "Ativa"): PromotionRecordLike => ({
  status: "started",
  type: "PRICE_DISCOUNT",
  name,
  start_date: "2026-11-01T03:00:00.000Z",
  finish_date: finish,
});

const scheduled = (start: string, finish: string, name = "Programada"): PromotionRecordLike => ({
  status: "pending",
  type: "DEAL",
  name,
  start_date: start,
  finish_date: finish,
});

describe("toPromotionWindows", () => {
  it("keeps active and scheduled promotions, drops invites and unusable dates", () => {
    const windows = toPromotionWindows([
      active(ENDS_15_NIGHT),
      scheduled("2026-11-16T03:00:00.000Z", "2026-11-30T02:59:00.000Z"),
      { status: "candidate", start_date: "2026-11-16T03:00:00.000Z", finish_date: "2026-12-01" },
      { status: "pending", finish_date: "2026-12-01T03:00:00.000Z" },
      { status: "started", finish_date: "não é data" },
    ]);
    assert.deepEqual(
      windows.map((w) => w.status),
      ["started", "pending"],
      "a scheduled promotion without start_date can't prove it continues",
    );
  });
});

describe("promotionCoverage", () => {
  it("extends to the scheduled promotion that starts the day after", () => {
    const result = coverage([
      active(ENDS_15_NIGHT),
      scheduled("2026-11-16T03:00:00.000Z", "2026-11-30T02:59:00.000Z"),
    ]);
    assert.equal(result.coveredUntil, "2026-11-30T02:59:00.000Z");
    assert.equal(result.extendedBy.length, 1);
    assert.equal(result.nextAfterGap, null);
  });

  it("extends when the scheduled one starts on the same day", () => {
    const result = coverage([
      active(ENDS_15_NIGHT),
      scheduled("2026-11-15T13:00:00.000Z", "2026-11-25T02:59:00.000Z"),
    ]);
    assert.equal(result.coveredUntil, "2026-11-25T02:59:00.000Z");
  });

  it("uses the local day, not the UTC one", () => {
    // Acaba 15/11 20:00 em SP (23:00 UTC); a programada começa 17/11 01:00 UTC,
    // que ainda é 16/11 em SP: emenda.
    const result = coverage([
      active("2026-11-15T23:00:00.000Z"),
      scheduled("2026-11-17T01:00:00.000Z", "2026-11-30T02:59:00.000Z"),
    ]);
    assert.equal(result.coveredUntil, "2026-11-30T02:59:00.000Z");
  });

  it("stops at a gap and reports the days without promotion", () => {
    const result = coverage([
      active(ENDS_15_NIGHT),
      scheduled("2026-11-18T03:00:00.000Z", "2026-11-30T02:59:00.000Z", "Black"),
    ]);
    assert.equal(result.coveredUntil, ENDS_15_NIGHT);
    assert.equal(result.extendedBy.length, 0);
    assert.equal(result.nextAfterGap?.window.name, "Black");
    assert.equal(result.nextAfterGap?.daysWithout, 2, "16 and 17 stay without promotion");
  });

  it("chains several scheduled promotions in start order", () => {
    const result = coverage([
      scheduled("2026-11-21T03:00:00.000Z", "2026-12-05T02:59:00.000Z", "Segunda"),
      active(ENDS_15_NIGHT),
      scheduled("2026-11-16T03:00:00.000Z", "2026-11-21T02:59:00.000Z", "Primeira"),
    ]);
    assert.equal(result.coveredUntil, "2026-12-05T02:59:00.000Z");
    assert.deepEqual(
      result.extendedBy.map((w) => w.name),
      ["Primeira", "Segunda"],
    );
  });

  it("ignores a scheduled promotion that ends before the coverage does", () => {
    const result = coverage([
      active("2026-11-30T02:59:00.000Z"),
      scheduled("2026-11-16T03:00:00.000Z", "2026-11-20T02:59:00.000Z"),
    ]);
    assert.equal(result.coveredUntil, "2026-11-30T02:59:00.000Z");
    assert.equal(result.extendedBy.length, 0);
  });

  it("counts the latest of two active promotions", () => {
    const result = coverage([
      active(ENDS_15_NIGHT, "Curta"),
      active("2026-11-30T02:59:00.000Z", "Longa"),
    ]);
    assert.equal(result.coveredUntil, "2026-11-30T02:59:00.000Z");
  });

  it("has no coverage without an active promotion", () => {
    const result = coverage([
      scheduled("2026-11-16T03:00:00.000Z", "2026-11-30T02:59:00.000Z"),
    ]);
    assert.equal(result.coveredUntil, null);
  });
});
