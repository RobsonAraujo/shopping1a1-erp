import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  icmsIncentiveAppliesToBuyer,
  isIcmsIncentiveValidOn,
  resolveIcmsIncentive,
} from "@/lib/tax-incentives/resolve";
import type { IcmsIncentiveRule } from "@/lib/tax-incentives/types";

function rule(overrides: Partial<IcmsIncentiveRule> = {}): IcmsIncentiveRule {
  return {
    ncm: "85163100",
    ratePercent: 12,
    appliesTo: "all",
    validFrom: null,
    validTo: null,
    note: null,
    updatedAt: "2026-11-26T00:00:00.000Z",
    ...overrides,
  };
}

function index(...rules: IcmsIncentiveRule[]) {
  return new Map(rules.map((r) => [r.ncm, r]));
}

describe("isIcmsIncentiveValidOn", () => {
  it("is inclusive on both ends", () => {
    const r = rule({ validFrom: "2026-11-01", validTo: "2026-11-30" });
    assert.equal(isIcmsIncentiveValidOn(r, "2026-10-31"), false);
    assert.equal(isIcmsIncentiveValidOn(r, "2026-11-01"), true);
    assert.equal(isIcmsIncentiveValidOn(r, "2026-11-30"), true);
    assert.equal(isIcmsIncentiveValidOn(r, "2026-12-01"), false);
  });

  it("open ends never limit", () => {
    assert.equal(isIcmsIncentiveValidOn(rule(), "2020-01-01"), true);
    assert.equal(isIcmsIncentiveValidOn(rule({ validFrom: "2026-06-01" }), "2030-01-01"), true);
  });
});

describe("resolveIcmsIncentive", () => {
  it("matches the product NCM regardless of how it was typed", () => {
    const result = resolveIcmsIncentive({
      index: index(rule()),
      ncm: "8516.31.00",
      excluded: false,
      orderDateYmd: "2026-11-10",
    });
    assert.deepEqual(result, { ncm: "85163100", aliquotaPercent: 12, appliesTo: "all" });
  });

  it("returns null for an excluded product, another NCM, an invalid NCM or no rules", () => {
    const base = { index: index(rule()), orderDateYmd: "2026-11-10" };
    assert.equal(resolveIcmsIncentive({ ...base, ncm: "85163100", excluded: true }), null);
    assert.equal(resolveIcmsIncentive({ ...base, ncm: "85163200", excluded: false }), null);
    assert.equal(resolveIcmsIncentive({ ...base, ncm: "8516", excluded: false }), null);
    assert.equal(
      resolveIcmsIncentive({ ...base, index: new Map(), ncm: "85163100", excluded: false }),
      null,
    );
  });

  it("respects the validity window by sale day", () => {
    const idx = index(rule({ validFrom: "2026-11-01" }));
    assert.equal(
      resolveIcmsIncentive({ index: idx, ncm: "85163100", excluded: false, orderDateYmd: "2026-10-31" }),
      null,
    );
    assert.notEqual(
      resolveIcmsIncentive({ index: idx, ncm: "85163100", excluded: false, orderDateYmd: "2026-11-01" }),
      null,
    );
  });

  it("a sale without date only gets rules without dates", () => {
    assert.notEqual(
      resolveIcmsIncentive({ index: index(rule()), ncm: "85163100", excluded: false, orderDateYmd: null }),
      null,
    );
    assert.equal(
      resolveIcmsIncentive({
        index: index(rule({ validTo: "2026-12-31" })),
        ncm: "85163100",
        excluded: false,
        orderDateYmd: null,
      }),
      null,
    );
  });
});

describe("icmsIncentiveAppliesToBuyer", () => {
  it("all = every buyer; contribuinte = only contributors", () => {
    assert.equal(icmsIncentiveAppliesToBuyer({ appliesTo: "all" }, false), true);
    assert.equal(icmsIncentiveAppliesToBuyer({ appliesTo: "contribuinte" }, false), false);
    assert.equal(icmsIncentiveAppliesToBuyer({ appliesTo: "contribuinte" }, true), true);
  });
});
