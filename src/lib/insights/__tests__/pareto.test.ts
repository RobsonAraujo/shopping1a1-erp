import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildParetoRows, paretoConcentration } from "../pareto";
import type { TaxReportPayload } from "@/lib/tax-report/types";

function payload(skus: Array<{ sku: string; receitaTotal: number; unidadesVendidas?: number; impostoTotal?: number }>): TaxReportPayload {
  return {
    porSku: skus.map((s) => ({
      sku: s.sku,
      receitaTotal: s.receitaTotal,
      unidadesVendidas: s.unidadesVendidas ?? 0,
      impostoTotal: s.impostoTotal ?? 0,
    })),
  } as unknown as TaxReportPayload;
}

describe("buildParetoRows", () => {
  it("returns an empty array when total revenue is zero", () => {
    assert.deepEqual(buildParetoRows(payload([])), []);
    assert.deepEqual(
      buildParetoRows(payload([{ sku: "A", receitaTotal: 0 }])),
      [],
    );
  });

  it("sorts by revenue descending and computes cumulative percentages", () => {
    const rows = buildParetoRows(
      payload([
        { sku: "B", receitaTotal: 30 },
        { sku: "A", receitaTotal: 70 },
      ]),
    );
    assert.deepEqual(rows.map((r) => r.sku), ["A", "B"]);
    assert.equal(rows[0].receitaPercent, 70);
    assert.equal(rows[0].receitaAcumuladaPercent, 70);
    assert.equal(rows[1].receitaPercent, 30);
    assert.equal(rows[1].receitaAcumuladaPercent, 100);
  });
});

describe("paretoConcentration", () => {
  it("sums the top-3 revenue percent and finds the 80% breakpoint", () => {
    const rows = buildParetoRows(
      payload([
        { sku: "A", receitaTotal: 50 },
        { sku: "B", receitaTotal: 30 },
        { sku: "C", receitaTotal: 15 },
        { sku: "D", receitaTotal: 5 },
      ]),
    );
    const { top3Percent, skusFor80Percent } = paretoConcentration(rows);
    assert.equal(top3Percent, 95);
    assert.equal(skusFor80Percent, 2); // A+B = 80% already reaches the threshold at index 2
  });

  it("falls back to the full row count when no row reaches 80%", () => {
    const rows = buildParetoRows(
      payload([
        { sku: "A", receitaTotal: 10 },
        { sku: "B", receitaTotal: 10 },
      ]),
    );
    // manually clip receitaAcumuladaPercent below 80 to simulate the edge case
    const clipped = rows.map((r) => ({ ...r, receitaAcumuladaPercent: 50 }));
    const { skusFor80Percent } = paretoConcentration(clipped);
    assert.equal(skusFor80Percent, clipped.length);
  });

  it("returns 0 for top3Percent on an empty row set", () => {
    assert.deepEqual(paretoConcentration([]), { top3Percent: 0, skusFor80Percent: 0 });
  });
});
