import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularCbsIbsInformativo, type CbsIbsVigenciaRow } from "../cbs-ibs";

describe("calcularCbsIbsInformativo", () => {
  it("returns null when there's no vigência configured for the year", () => {
    assert.equal(calcularCbsIbsInformativo(1000, 2026, null), null);
  });

  it("computes valorCbs and valorIbs from the configured rates", () => {
    const vigencia: CbsIbsVigenciaRow = {
      year: 2026,
      cbsRate: 0.009,
      ibsEstadualRate: 0.001,
      ibsMunicipalRate: 0.002,
      notes: null,
    };
    const result = calcularCbsIbsInformativo(1000, 2026, vigencia);
    assert.ok(result);
    assert.equal(result.valorCbs, 9);
    assert.equal(result.valorIbs, 3);
    assert.equal(result.year, 2026);
  });

  it("returns null valorCbs when cbsRate is null, without affecting valorIbs", () => {
    const vigencia: CbsIbsVigenciaRow = {
      year: 2026,
      cbsRate: null,
      ibsEstadualRate: 0.001,
      ibsMunicipalRate: 0,
      notes: null,
    };
    const result = calcularCbsIbsInformativo(1000, 2026, vigencia);
    assert.equal(result?.valorCbs, null);
    assert.equal(result?.valorIbs, 1);
  });

  it("returns null valorIbs when both ibs rates are absent/zero", () => {
    const vigencia: CbsIbsVigenciaRow = {
      year: 2026,
      cbsRate: 0.01,
      ibsEstadualRate: null,
      ibsMunicipalRate: null,
      notes: null,
    };
    const result = calcularCbsIbsInformativo(1000, 2026, vigencia);
    assert.equal(result?.valorIbs, null);
    assert.equal(result?.valorCbs, 10);
  });

  it("passes through notes and raw individual rates unmodified", () => {
    const vigencia: CbsIbsVigenciaRow = {
      year: 2026,
      cbsRate: 0.01,
      ibsEstadualRate: 0.02,
      ibsMunicipalRate: 0.03,
      notes: "provisório",
    };
    const result = calcularCbsIbsInformativo(500, 2026, vigencia);
    assert.equal(result?.cbs, 0.01);
    assert.equal(result?.ibsEstadual, 0.02);
    assert.equal(result?.ibsMunicipal, 0.03);
    assert.equal(result?.notes, "provisório");
  });
});
