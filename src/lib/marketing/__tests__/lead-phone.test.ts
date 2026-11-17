import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLeadPhone } from "../lead-phone";

describe("normalizeLeadPhone", () => {
  it("accepts the usual ways people type a Brazilian mobile", () => {
    for (const typed of [
      "(11) 98765-4321",
      "11987654321",
      "11 9 8765 4321",
      "+55 11 98765-4321",
      "5511987654321",
      "0055 11 98765-4321",
      "011 98765-4321",
    ]) {
      assert.equal(normalizeLeadPhone(typed), "5511987654321", typed);
    }
  });

  it("rejects landlines, missing area code and junk", () => {
    for (const typed of [
      "(11) 3456-7890",
      "98765-4321",
      "(10) 98765-4321",
      "abc",
      "",
      "   ",
    ]) {
      assert.equal(normalizeLeadPhone(typed), null, typed);
    }
    assert.equal(normalizeLeadPhone(null), null);
    assert.equal(normalizeLeadPhone(undefined), null);
  });
});
