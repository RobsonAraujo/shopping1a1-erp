import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNcm, normalizeNcm } from "@/lib/tax-incentives/ncm";

describe("normalizeNcm", () => {
  it("accepts dotted, plain and spaced 8-digit NCMs", () => {
    assert.equal(normalizeNcm("8516.31.00"), "85163100");
    assert.equal(normalizeNcm("85163100"), "85163100");
    assert.equal(normalizeNcm(" 8516 31 00 "), "85163100");
  });

  it("rejects anything that is not 8 digits", () => {
    assert.equal(normalizeNcm(null), null);
    assert.equal(normalizeNcm(""), null);
    assert.equal(normalizeNcm("8516.31"), null);
    assert.equal(normalizeNcm("8516.31.000"), null);
  });
});

describe("formatNcm", () => {
  it("formats as 0000.00.00 and leaves invalid input as is", () => {
    assert.equal(formatNcm("85163100"), "8516.31.00");
    assert.equal(formatNcm("8516.31.00"), "8516.31.00");
    assert.equal(formatNcm("123"), "123");
  });
});
