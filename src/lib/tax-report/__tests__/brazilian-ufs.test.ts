import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeUf,
  ufFromStateName,
  ufFromStateCode,
  ufFromTruncatedMlStateId,
  ufFromStateId,
  resolveUfDestino,
  BRAZILIAN_UFS,
  BRAZILIAN_UF_OPTIONS,
} from "../brazilian-ufs";

describe("normalizeUf", () => {
  it("accepts a valid 2-letter UF, case-insensitively", () => {
    assert.equal(normalizeUf("sp"), "SP");
    assert.equal(normalizeUf(" SP "), "SP");
  });

  it("rejects unknown 2-letter codes", () => {
    assert.equal(normalizeUf("ZZ"), null);
  });

  it("rejects strings that aren't exactly 2 characters", () => {
    assert.equal(normalizeUf("S"), null);
    assert.equal(normalizeUf("SPX"), null);
  });

  it("returns null for null/undefined/empty", () => {
    assert.equal(normalizeUf(null), null);
    assert.equal(normalizeUf(undefined), null);
    assert.equal(normalizeUf(""), null);
  });
});

describe("ufFromStateName", () => {
  it("resolves accented full state names", () => {
    assert.equal(ufFromStateName("São Paulo"), "SP");
    assert.equal(ufFromStateName("Espírito Santo"), "ES");
  });

  it("resolves unaccented variants", () => {
    assert.equal(ufFromStateName("Sao Paulo"), "SP");
    assert.equal(ufFromStateName("Ceara"), "CE");
  });

  it("is case-insensitive", () => {
    assert.equal(ufFromStateName("goiás"), "GO");
  });

  it("returns null for unrecognized names", () => {
    assert.equal(ufFromStateName("Narnia"), null);
    assert.equal(ufFromStateName(null), null);
  });
});

describe("ufFromStateCode", () => {
  it("resolves IBGE codes", () => {
    assert.equal(ufFromStateCode("35"), "SP");
    assert.equal(ufFromStateCode("33"), "RJ");
  });

  it("strips non-digit characters before matching", () => {
    assert.equal(ufFromStateCode("BR-35"), "SP");
  });

  it("returns null for unknown codes", () => {
    assert.equal(ufFromStateCode("99"), null);
    assert.equal(ufFromStateCode(null), null);
    assert.equal(ufFromStateCode(""), null);
  });
});

describe("ufFromTruncatedMlStateId", () => {
  it("resolves an unambiguous 2-char truncated name", () => {
    // Truncated prefixes that already equal a real UF code (e.g. "Bahia" -> "Ba" -> "BA")
    // are excluded from this table, since normalizeUf() already resolves them directly.
    // "Distrito Federal" -> "Di" isn't itself a UF code, so it's a genuine truncation entry.
    assert.equal(ufFromTruncatedMlStateId("Di"), "DF");
  });

  it("returns null for values with no unique match", () => {
    assert.equal(ufFromTruncatedMlStateId("zz"), null);
  });

  it("returns null for null/undefined", () => {
    assert.equal(ufFromTruncatedMlStateId(null), null);
  });
});

describe("ufFromStateId", () => {
  it("resolves a plain 2-letter code directly", () => {
    assert.equal(ufFromStateId("sp"), "SP");
  });

  it("resolves a 'BR-XX' prefixed id", () => {
    assert.equal(ufFromStateId("BR-SP"), "SP");
    assert.equal(ufFromStateId("br-rj"), "RJ");
  });

  it("falls back to name resolution for a multi-word full name", () => {
    // Regression test: the "BR-XX"/"XX" regex used to have no overall anchor
    // (`/(?:^BR-)?([A-Z]{2})$/i`), so it matched the last 2 letters of ANY
    // string ending in letters — e.g. "Rio de Janeiro" -> "RO" (a real UF,
    // Rondônia!) was returned instead of falling through to name resolution.
    // Now anchored (`/^(?:BR-)?([A-Z]{2})$/i`) so only exact "XX"/"BR-XX"
    // forms match, and everything else falls through correctly.
    assert.equal(ufFromStateId("São Paulo"), "SP");
    assert.equal(ufFromStateId("Bahia"), "BA");
    assert.equal(ufFromStateId("Rio de Janeiro"), "RJ");
  });

  it("resolves an IBGE numeric code", () => {
    assert.equal(ufFromStateId("35"), "SP");
  });

  it("returns null when nothing matches", () => {
    assert.equal(ufFromStateId("nowhere"), null);
    assert.equal(ufFromStateId(null), null);
  });
});

describe("resolveUfDestino", () => {
  it("prefers a direct 2-letter UF match", () => {
    assert.equal(resolveUfDestino("sp"), "SP");
  });

  it("falls back through name/code/id resolvers", () => {
    assert.equal(resolveUfDestino("São Paulo"), "SP");
    assert.equal(resolveUfDestino("35"), "SP");
    assert.equal(resolveUfDestino("BR-SP"), "SP");
  });

  it("returns null for null/unrecognized input", () => {
    assert.equal(resolveUfDestino(null), null);
    assert.equal(resolveUfDestino("nowhere"), null);
  });
});

describe("BRAZILIAN_UFS / BRAZILIAN_UF_OPTIONS", () => {
  it("has exactly 27 UFs (26 states + DF)", () => {
    assert.equal(BRAZILIAN_UFS.length, 27);
  });

  it("builds matching value/label options for every UF", () => {
    assert.equal(BRAZILIAN_UF_OPTIONS.length, 27);
    assert.deepEqual(BRAZILIAN_UF_OPTIONS[0], {
      value: BRAZILIAN_UFS[0],
      label: BRAZILIAN_UFS[0],
    });
  });
});
