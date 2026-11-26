import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  icmsIncentiveFromRow,
  splitIncentiveExclusions,
  validateIcmsIncentiveInput,
} from "@/lib/tax-incentives/icms-incentive-data";

const valid = {
  ncm: "8516.31.00",
  ratePercent: 12,
  appliesTo: "all" as const,
  validFrom: null,
  validTo: null,
  note: null,
};

describe("validateIcmsIncentiveInput", () => {
  it("accepts a valid incentive, including 0% (isenção)", () => {
    assert.equal(validateIcmsIncentiveInput(valid), null);
    assert.equal(validateIcmsIncentiveInput({ ...valid, ratePercent: 0 }), null);
  });

  it("rejects NCM without 8 digits, rate outside 0–100 and inverted validity", () => {
    assert.match(validateIcmsIncentiveInput({ ...valid, ncm: "8516" }) ?? "", /8 dígitos/);
    assert.ok(validateIcmsIncentiveInput({ ...valid, ratePercent: -1 }));
    assert.ok(validateIcmsIncentiveInput({ ...valid, ratePercent: 101 }));
    assert.match(
      validateIcmsIncentiveInput({ ...valid, validFrom: "2026-12-01", validTo: "2026-11-01" }) ?? "",
      /anterior/,
    );
  });
});

describe("splitIncentiveExclusions", () => {
  it("ignores products from another org or another NCM", () => {
    const allowed = new Set(["MLB1", "MLB2"]);
    const result = splitIncentiveExclusions(allowed, [
      { mlItemId: "MLB1", excluded: true },
      { mlItemId: "MLB2", excluded: false },
      { mlItemId: "MLB-OUTRA-ORG", excluded: true },
    ]);
    assert.deepEqual(result, { excludedIds: ["MLB1"], includedIds: ["MLB2"] });
  });
});

describe("icmsIncentiveFromRow", () => {
  it("reads @db.Date columns as the calendar day", () => {
    const rule = icmsIncentiveFromRow({
      ncm: "85163100",
      ratePercent: "12.0000",
      appliesTo: "contribuinte",
      validFrom: new Date("2026-11-01T00:00:00.000Z"),
      validTo: null,
      note: "RICMS/SP Anexo II",
      updatedAt: new Date("2026-11-26T15:00:00.000Z"),
    });
    assert.equal(rule.ratePercent, 12);
    assert.equal(rule.validFrom, "2026-11-01");
    assert.equal(rule.validTo, null);
    assert.equal(rule.appliesTo, "contribuinte");
  });
});
