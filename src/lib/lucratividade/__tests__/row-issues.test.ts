import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRowIssues } from "../row-issues";

const base = {
  sku: "SKU1",
  isKit: false,
  isKitComposition: false,
  kitMissingSkus: [] as string[],
  productCost: 10,
  taxRatePercent: 8,
  errors: [] as string[],
  warnings: [] as string[],
};
const lucroReal = { taxRegime: "LUCRO_REAL" as const, simplesRateConfigured: false };
const simples = { taxRegime: "SIMPLES" as const, simplesRateConfigured: false };

describe("buildRowIssues", () => {
  it("no issues for a complete listing", () => {
    assert.deepEqual(buildRowIssues(base, lucroReal), []);
  });

  it("missing tax points to Tributário in Lucro Real", () => {
    const [issue] = buildRowIssues({ ...base, taxRatePercent: null }, lucroReal);
    assert.equal(issue.key, "missing_tax");
    assert.equal(issue.action?.href, "/dashboard/tributario");
  });

  it("missing tax points to company settings in Simples", () => {
    const [issue] = buildRowIssues({ ...base, taxRatePercent: null }, simples);
    assert.equal(issue.title, "Alíquota do Simples não configurada");
    assert.equal(issue.action?.href, "/dashboard/configuracoes/empresa");
  });

  it("flags missing cost, missing sku and kit problems", () => {
    assert.equal(
      buildRowIssues({ ...base, productCost: null }, lucroReal)[0].key,
      "missing_cost",
    );
    assert.equal(
      buildRowIssues({ ...base, sku: null, productCost: null }, lucroReal)[0].key,
      "missing_sku",
    );
    assert.equal(
      buildRowIssues(
        { ...base, sku: null, isKit: true, productCost: null },
        lucroReal,
      )[0].key,
      "kit_without_composition",
    );
    const kit = buildRowIssues(
      { ...base, sku: null, isKit: true, isKitComposition: true, kitMissingSkus: ["A", "B"] },
      lucroReal,
    );
    assert.equal(kit[0].key, "kit_incomplete");
    assert.match(kit[0].detail, /A, B/);
  });

  it("server warnings become non-blocking issues", () => {
    const issues = buildRowIssues(
      { ...base, warnings: ["Gasto em ADS sem vendas no período; TACOS indisponível."] },
      lucroReal,
    );
    assert.equal(issues[0].severity, "warning");
  });
});
