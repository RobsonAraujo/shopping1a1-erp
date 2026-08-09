import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getZonedParts, zonedLocalToUtc, atReportTime } from "../report-timezone";

const TZ = "America/Sao_Paulo";

describe("getZonedParts", () => {
  it("extracts year/month/day for a UTC instant in a timezone", () => {
    // 2026-06-15T02:00:00Z is 2026-06-14 23:00 in São Paulo (UTC-3)
    const parts = getZonedParts(new Date("2026-06-15T02:00:00Z"), TZ);
    assert.deepEqual(parts, { year: 2026, month: 6, day: 14 });
  });

  it("matches UTC directly when timeZone is UTC", () => {
    const parts = getZonedParts(new Date("2026-06-15T12:00:00Z"), "UTC");
    assert.deepEqual(parts, { year: 2026, month: 6, day: 15 });
  });
});

describe("zonedLocalToUtc", () => {
  it("converts a São Paulo local midnight to the correct UTC instant (UTC-3)", () => {
    const utc = zonedLocalToUtc(2026, 6, 15, 0, 0, 0, 0, TZ);
    assert.equal(utc.toISOString(), "2026-06-15T03:00:00.000Z");
  });

  it("round-trips through getZonedParts", () => {
    const utc = zonedLocalToUtc(2026, 1, 1, 12, 30, 0, 0, TZ);
    const parts = getZonedParts(utc, TZ);
    assert.deepEqual(parts, { year: 2026, month: 1, day: 1 });
  });
});

describe("atReportTime", () => {
  it("returns the given hour/minute today (dayOffset=0) in the timezone", () => {
    const base = new Date("2026-06-15T18:00:00Z"); // 15:00 in São Paulo
    const result = atReportTime(base, 0, 9, 0, TZ);
    const parts = getZonedParts(result, TZ);
    assert.deepEqual(parts, { year: 2026, month: 6, day: 15 });
    assert.equal(result.toISOString(), "2026-06-15T12:00:00.000Z"); // 09:00 -3 = 12:00 UTC
  });

  it("subtracts dayOffset calendar days", () => {
    const base = new Date("2026-06-15T18:00:00Z");
    const result = atReportTime(base, 7, 0, 0, TZ);
    const parts = getZonedParts(result, TZ);
    assert.equal(parts.day, 8);
  });
});
