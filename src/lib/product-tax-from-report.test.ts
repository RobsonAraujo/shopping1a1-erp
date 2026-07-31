import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadProductTaxFromLatestReport } from "@/lib/product-tax-from-report";
import type { SkuAggregation, TaxReportPayload } from "@/lib/tax-report/types";

function sampleSku(overrides: Partial<SkuAggregation> = {}): SkuAggregation {
  return {
    sku: "SKU-A",
    quantidadeVendas: 10,
    unidadesVendidas: 10,
    receitaTotal: 1000,
    impostoTotal: 150,
    impostoMedioPorVenda: 15,
    impostoMedioPercentual: 15,
    impostoOperacionalMedioPercentual: 18.5,
    transacoes: [],
    ...overrides,
  };
}

function samplePayload(
  porSku: SkuAggregation[],
  geradoEm = "2026-07-20T12:00:00.000Z",
  year = 2026,
  month = 7,
): TaxReportPayload {
  return {
    year,
    month,
    meta: { geradoEm },
    porSku,
  } as unknown as TaxReportPayload;
}

describe("loadProductTaxFromLatestReport", () => {
  it("returns empty lookup when there are no snapshots", async () => {
    const result = await loadProductTaxFromLatestReport(1, async () => []);
    assert.equal(result.generatedAt, null);
    assert.equal(result.bySku.size, 0);
  });

  it("maps sku to its impostoOperacionalMedioPercentual and the snapshot date", async () => {
    const payload = samplePayload([sampleSku()]);
    const result = await loadProductTaxFromLatestReport(1, async () => [payload]);

    assert.equal(result.generatedAt, "2026-07-20T12:00:00.000Z");
    const entry = result.bySku.get("SKU-A");
    assert.ok(entry);
    assert.equal(entry!.taxPercent, 18.5);
    assert.equal(entry!.generatedAt, "2026-07-20T12:00:00.000Z");
  });

  it("indexes sku aliases to the same entry", async () => {
    const payload = samplePayload([
      sampleSku({ sku: "SKU-A", skuAliases: ["OLD-SKU-A"] }),
    ]);
    const result = await loadProductTaxFromLatestReport(1, async () => [payload]);

    assert.ok(result.bySku.get("SKU-A"));
    assert.ok(result.bySku.get("OLD-SKU-A"));
  });

  it("returns undefined for a sku absent from every snapshot", async () => {
    const payload = samplePayload([sampleSku({ sku: "SKU-A" })]);
    const result = await loadProductTaxFromLatestReport(1, async () => [payload]);

    assert.equal(result.bySku.get("SKU-B"), undefined);
  });

  it("falls back to an older snapshot when the sku is missing from the latest one", async () => {
    const latest = samplePayload(
      [sampleSku({ sku: "SKU-A", impostoOperacionalMedioPercentual: 20 })],
      "2026-07-20T12:00:00.000Z",
      2026,
      7,
    );
    const older = samplePayload(
      [sampleSku({ sku: "SKU-B", impostoOperacionalMedioPercentual: 12 })],
      "2026-06-15T09:00:00.000Z",
      2026,
      6,
    );
    const result = await loadProductTaxFromLatestReport(1, async () => [
      latest,
      older,
    ]);

    assert.equal(result.generatedAt, "2026-07-20T12:00:00.000Z");
    const entryB = result.bySku.get("SKU-B");
    assert.ok(entryB);
    assert.equal(entryB!.taxPercent, 12);
    assert.equal(entryB!.generatedAt, "2026-06-15T09:00:00.000Z");
    assert.equal(entryB!.year, 2026);
    assert.equal(entryB!.month, 6);
  });

  it("prefers the most recent snapshot when the sku appears in more than one", async () => {
    const latest = samplePayload(
      [sampleSku({ sku: "SKU-A", impostoOperacionalMedioPercentual: 20 })],
      "2026-07-20T12:00:00.000Z",
      2026,
      7,
    );
    const older = samplePayload(
      [sampleSku({ sku: "SKU-A", impostoOperacionalMedioPercentual: 12 })],
      "2026-06-15T09:00:00.000Z",
      2026,
      6,
    );
    const result = await loadProductTaxFromLatestReport(1, async () => [
      latest,
      older,
    ]);

    const entry = result.bySku.get("SKU-A");
    assert.ok(entry);
    assert.equal(entry!.taxPercent, 20);
    assert.equal(entry!.generatedAt, "2026-07-20T12:00:00.000Z");
    assert.equal(entry!.month, 7);
  });

  it("ignores the anchor when an explicit loadSnapshots is provided (test/DRE injection contract)", async () => {
    const payload = samplePayload([sampleSku({ sku: "SKU-A" })], undefined, 2026, 9);
    // anchor aponta pra um mês anterior ao snapshot devolvido pelo loader
    // explícito — como o loader é explícito, o anchor não deve filtrar nada
    // aqui (quem decide o que devolver é o loader injetado, não o anchor).
    const result = await loadProductTaxFromLatestReport(
      1,
      async () => [payload],
      { year: 2026, month: 1 },
    );
    assert.ok(result.bySku.get("SKU-A"));
  });
});
