import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getListingStatusDisplay, countListingsByStatus } from "../listing-status";

describe("getListingStatusDisplay", () => {
  it("active listing", () => {
    const d = getListingStatusDisplay("active", 10);
    assert.equal(d.label, "Ativo");
    assert.equal(d.showBadge, false);
    assert.equal(d.rowMuted, false);
  });

  it("paused with warehouse stock but no ml stock", () => {
    const d = getListingStatusDisplay("paused", 0, 5);
    assert.equal(d.label, "Pausado no ML — estoque no galpão");
    assert.equal(d.showBadge, true);
    assert.equal(d.rowMuted, true);
  });

  it("paused with no stock anywhere", () => {
    const d = getListingStatusDisplay("paused", 0, 0);
    assert.equal(d.label, "Pausado — sem estoque");
  });

  it("paused with ml stock available", () => {
    const d = getListingStatusDisplay("paused", 3, 0);
    assert.equal(d.label, "Pausado no ML");
  });

  it("paused defaults warehouseStock to 0 when omitted", () => {
    const d = getListingStatusDisplay("paused", 0);
    assert.equal(d.label, "Pausado — sem estoque");
  });

  it("unknown status falls back to generic label", () => {
    const d = getListingStatusDisplay("closed", 0);
    assert.equal(d.label, 'Status: closed');
    assert.equal(d.showBadge, true);
    assert.equal(d.rowMuted, true);
  });
});

describe("countListingsByStatus", () => {
  it("tallies active/paused/other", () => {
    const counts = countListingsByStatus([
      { status: "active" },
      { status: "active" },
      { status: "paused" },
      { status: "closed" },
      { status: "under_review" },
    ]);
    assert.deepEqual(counts, { active: 2, paused: 1, other: 2 });
  });

  it("returns zeros for empty list", () => {
    assert.deepEqual(countListingsByStatus([]), {
      active: 0,
      paused: 0,
      other: 0,
    });
  });
});
