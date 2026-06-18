import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consolidarIrpjCslMensal } from "@/lib/tax-report/calculators/irpj-csll";
import type { TaxCompanyConfig } from "@/lib/tax-report/types";

const config: TaxCompanyConfig = {
  taxRegime: "LUCRO_REAL",
  originUf: "SP",
  pisRatePercent: 1.65,
  cofinsRatePercent: 7.6,
  excludeIcmsFromPisCofinsBase: true,
  irpjAdditionalThreshold: 20_000,
};

describe("consolidarIrpjCslMensal", () => {
  it("applies 10% additional only on consolidated excess above threshold", () => {
    const result = consolidarIrpjCslMensal([15_000, 10_000], config);
    assert.equal(result.irpjAdicional, 500);
    assert.equal(result.irpjTotal, 3750 + 500);
    assert.equal(result.csllTotal, 2250);
  });
});
