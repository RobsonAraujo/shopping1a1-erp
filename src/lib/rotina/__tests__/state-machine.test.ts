import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveStatusSince } from "@/lib/rotina/catalog-history";
import { reconcileRefreshStates, stateKey } from "@/lib/rotina/reconcile";
import { resolveActionVisibility } from "@/lib/rotina/visibility";
import { NOW, state } from "./fixtures";

describe("resolveActionVisibility", () => {
  const base = { kind: "condition" as const, now: NOW, episodeStart: null };

  it("shows an action without decision", () => {
    assert.deepEqual(
      resolveActionVisibility({ ...base, state: null, dataAt: null }),
      { bucket: "active", continues: false },
    );
  });

  it("hides a done action until newer data arrives, then shows it as 'continues'", () => {
    const done = state({ status: "done", statusChangedAt: "2026-11-10T10:00:00.000Z" });
    assert.equal(
      resolveActionVisibility({ ...base, state: done, dataAt: "2026-11-10T09:00:00.000Z" }).bucket,
      "done",
    );
    assert.deepEqual(
      resolveActionVisibility({ ...base, state: done, dataAt: "2026-11-10T11:00:00.000Z" }),
      { bucket: "active", continues: true },
    );
  });

  it("forgets a done decision when a new episode starts (lost the buy box again)", () => {
    const done = state({ status: "done", statusChangedAt: "2026-11-05T10:00:00.000Z" });
    assert.deepEqual(
      resolveActionVisibility({
        ...base,
        state: done,
        dataAt: "2026-11-05T09:00:00.000Z",
        episodeStart: "2026-11-09T08:00:00.000Z",
      }),
      { bucket: "active", continues: false },
    );
  });

  it("keeps a snooze until it expires", () => {
    const snoozed = state({
      status: "snoozed",
      statusChangedAt: "2026-11-10T10:00:00.000Z",
      snoozedUntil: "2026-11-11T03:00:00.000Z",
    });
    assert.equal(
      resolveActionVisibility({ ...base, state: snoozed, dataAt: null }).bucket,
      "snoozed",
    );
    assert.equal(
      resolveActionVisibility({
        ...base,
        state: snoozed,
        now: new Date("2026-11-11T04:00:00.000Z"),
        dataAt: null,
      }).bucket,
      "active",
    );
  });

  it("keeps a dismissed action out, whatever happens", () => {
    const dismissed = state({ status: "dismissed" });
    assert.equal(
      resolveActionVisibility({ ...base, state: dismissed, dataAt: "2026-11-10T11:00:00.000Z" })
        .bucket,
      "dismissed",
    );
  });

  it("closes an acknowledged event for good", () => {
    const acked = state({ status: "done", rule: "catalog_takeover" });
    assert.equal(
      resolveActionVisibility({
        kind: "event",
        state: acked,
        now: NOW,
        dataAt: "2026-11-11T00:00:00.000Z",
        episodeStart: null,
      }).bucket,
      "done",
    );
  });
});

describe("reconcileRefreshStates", () => {
  const rules = ["promo_missing", "ads_missing"] as const;

  it("creates, touches, reopens and resolves", () => {
    const writes = reconcileRefreshStates({
      itemIds: ["MLB1", "MLB2", "MLB3", "MLB4"],
      rules,
      firing: new Set([
        stateKey("MLB1", "promo_missing"),
        stateKey("MLB2", "promo_missing"),
        stateKey("MLB3", "promo_missing"),
      ]),
      existing: [
        state({ mlItemId: "MLB2", rule: "promo_missing", status: "done" }),
        state({ mlItemId: "MLB3", rule: "promo_missing", status: "resolved" }),
        state({ mlItemId: "MLB4", rule: "ads_missing", status: "open" }),
      ],
    });

    assert.deepEqual(writes, [
      { op: "create", mlItemId: "MLB1", rule: "promo_missing" },
      { op: "touch", mlItemId: "MLB2", rule: "promo_missing" },
      { op: "reopen", mlItemId: "MLB3", rule: "promo_missing" },
      { op: "resolve", mlItemId: "MLB4", rule: "ads_missing" },
    ]);
  });

  it("keeps a dismissed state when the condition clears", () => {
    const writes = reconcileRefreshStates({
      itemIds: ["MLB1"],
      rules,
      firing: new Set(),
      existing: [state({ status: "dismissed" })],
    });
    assert.deepEqual(writes, []);
  });

  it("only touches the items it covered", () => {
    const writes = reconcileRefreshStates({
      itemIds: ["MLB1"],
      rules,
      firing: new Set(),
      existing: [state({ mlItemId: "MLB2", status: "open" })],
    });
    assert.deepEqual(writes, []);
  });
});

describe("resolveStatusSince", () => {
  it("finds the start of the current streak, ignoring unknown in the middle", () => {
    const result = resolveStatusSince(
      [
        { status: "winning", snapshotAt: "2026-11-08T10:00:00.000Z" },
        { status: "losing", snapshotAt: "2026-11-09T10:00:00.000Z" },
        { status: "unknown", snapshotAt: "2026-11-09T12:00:00.000Z" },
        { status: "losing", snapshotAt: "2026-11-10T09:00:00.000Z" },
      ],
      "losing",
    );
    assert.deepEqual(result, { since: "2026-11-09T10:00:00.000Z", truncated: false });
  });

  it("is not fooled by the daily heartbeat snapshot", () => {
    const result = resolveStatusSince(
      [
        { status: "losing", snapshotAt: "2026-11-01T10:00:00.000Z" },
        { status: "losing", snapshotAt: "2026-11-10T06:00:00.000Z" },
      ],
      "losing",
    );
    assert.equal(result.since, "2026-11-01T10:00:00.000Z");
    assert.equal(result.truncated, true, "the window never showed another status");
  });

  it("returns null without a matching snapshot", () => {
    assert.deepEqual(resolveStatusSince([], "losing"), { since: null, truncated: false });
  });
});
