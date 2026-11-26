import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { belowPmaBy } from "../pma";

describe("belowPmaBy", () => {
  it("says how much is missing when the price is below the PMA", () => {
    assert.equal(belowPmaBy(85.9, 89.9), 4);
    assert.equal(belowPmaBy(89.89, 89.9), 0.01);
  });

  it("is null at the PMA, above it or within half a cent", () => {
    assert.equal(belowPmaBy(89.9, 89.9), null);
    assert.equal(belowPmaBy(95, 89.9), null);
    assert.equal(belowPmaBy(89.896, 89.9), null);
  });

  it("is null without a PMA", () => {
    assert.equal(belowPmaBy(10, null), null);
    assert.equal(belowPmaBy(10, undefined), null);
    assert.equal(belowPmaBy(10, 0), null);
  });
});
