import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMoneyCostInput, parsePercentCostInput } from "../financial-cost-input";

describe("parseMoneyCostInput", () => {
  it("returns null for an empty/blank string", () => {
    assert.equal(parseMoneyCostInput(""), null);
    assert.equal(parseMoneyCostInput("   "), null);
  });

  it("parses a plain integer", () => {
    assert.equal(parseMoneyCostInput("100"), 100);
  });

  it("parses comma decimal separator", () => {
    assert.equal(parseMoneyCostInput("11,97"), 11.97);
  });

  it("parses dot decimal separator", () => {
    assert.equal(parseMoneyCostInput("11.97"), 11.97);
  });

  it("parses thousands-separated values with comma decimals (1.234,56)", () => {
    assert.equal(parseMoneyCostInput("1.234,56"), 1234.56);
  });

  it("strips a leading R$ prefix and surrounding whitespace", () => {
    assert.equal(parseMoneyCostInput("R$ 11,97"), 11.97);
    assert.equal(parseMoneyCostInput("r$11,97"), 11.97);
  });

  it("strips a trailing % sign", () => {
    assert.equal(parseMoneyCostInput("12,25%"), 12.25);
  });

  it("returns 'invalid' for negative numbers", () => {
    assert.equal(parseMoneyCostInput("-5"), "invalid");
  });

  it("returns 'invalid' for non-numeric garbage", () => {
    assert.equal(parseMoneyCostInput("abc"), "invalid");
  });

  it("accepts 0 as a valid value", () => {
    assert.equal(parseMoneyCostInput("0"), 0);
  });
});

describe("parsePercentCostInput", () => {
  it("delegates to parseMoneyCostInput for null/invalid", () => {
    assert.equal(parsePercentCostInput(""), null);
    assert.equal(parsePercentCostInput("abc"), "invalid");
  });

  it("accepts values up to 100", () => {
    assert.equal(parsePercentCostInput("100"), 100);
  });

  it("rejects values above 100", () => {
    assert.equal(parsePercentCostInput("100,01"), "invalid");
    assert.equal(parsePercentCostInput("150"), "invalid");
  });

  it("accepts a comma-decimal percentage under 100", () => {
    assert.equal(parsePercentCostInput("12,25"), 12.25);
  });
});
