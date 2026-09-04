import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfigForGeneration } from "../generate-monthly-report";
import type { TaxCompanyConfig } from "@/lib/tax-report/types";

function simplesConfig(): TaxCompanyConfig {
  return {
    taxRegime: "SIMPLES",
    originUf: "SP",
    pisRatePercent: 1.65,
    cofinsRatePercent: 7.6,
    excludeIcmsFromPisCofinsBase: true,
    considerIcmsStRecuperavel: true,
    simplesAliquotaEfetivaPercent: 6.5,
  };
}

describe("resolveConfigForGeneration", () => {
  it("mantém o config original quando forceRegime não é passado", () => {
    const config = simplesConfig();
    const resolved = resolveConfigForGeneration(config);
    assert.equal(resolved.taxRegime, "SIMPLES");
    assert.equal(resolved, config);
  });

  it("sobrepõe só taxRegime quando forceRegime é LUCRO_REAL, sem alterar o resto", () => {
    const config = simplesConfig();
    const resolved = resolveConfigForGeneration(config, { forceRegime: "LUCRO_REAL" });
    assert.equal(resolved.taxRegime, "LUCRO_REAL");
    assert.equal(resolved.simplesAliquotaEfetivaPercent, 6.5);
    assert.equal(resolved.originUf, "SP");
    // Não muta o objeto original — config real da org continua intacto.
    assert.equal(config.taxRegime, "SIMPLES");
  });

  it("sobrepõe forceRegime e forceConsiderIcmsStRecuperavel juntos", () => {
    const config = simplesConfig();
    const resolved = resolveConfigForGeneration(config, {
      forceRegime: "LUCRO_REAL",
      forceConsiderIcmsStRecuperavel: false,
    });
    assert.equal(resolved.taxRegime, "LUCRO_REAL");
    assert.equal(resolved.considerIcmsStRecuperavel, false);
    // Config real da org (considerIcmsStRecuperavel: true) continua intacto.
    assert.equal(config.considerIcmsStRecuperavel, true);
  });

  it("aplica forceConsiderIcmsStRecuperavel isoladamente, sem mexer no regime", () => {
    const config = simplesConfig();
    const resolved = resolveConfigForGeneration(config, {
      forceConsiderIcmsStRecuperavel: false,
    });
    assert.equal(resolved.taxRegime, "SIMPLES");
    assert.equal(resolved.considerIcmsStRecuperavel, false);
  });

  it("força excludeIcmsFromPisCofinsBase: true mesmo quando o config real está false", () => {
    const config = { ...simplesConfig(), excludeIcmsFromPisCofinsBase: false };
    const resolved = resolveConfigForGeneration(config, {
      forceExcludeIcmsFromPisCofinsBase: true,
    });
    assert.equal(resolved.excludeIcmsFromPisCofinsBase, true);
    // Config real da org continua intacto.
    assert.equal(config.excludeIcmsFromPisCofinsBase, false);
  });

  it("aplica os três overrides de simulação juntos", () => {
    const config = { ...simplesConfig(), excludeIcmsFromPisCofinsBase: false };
    const resolved = resolveConfigForGeneration(config, {
      forceRegime: "LUCRO_REAL",
      forceConsiderIcmsStRecuperavel: false,
      forceExcludeIcmsFromPisCofinsBase: true,
    });
    assert.equal(resolved.taxRegime, "LUCRO_REAL");
    assert.equal(resolved.considerIcmsStRecuperavel, false);
    assert.equal(resolved.excludeIcmsFromPisCofinsBase, true);
  });
});
