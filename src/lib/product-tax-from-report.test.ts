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

function samplePayload(porSku: SkuAggregation[]): TaxReportPayload {
  return {
    meta: { geradoEm: "2026-07-20T12:00:00.000Z" },
    porSku,
  } as unknown as TaxReportPayload;
}

describe("loadProductTaxFromLatestReport", () => {
  it("returns empty lookup when there is no snapshot", async () => {
    const result = await loadProductTaxFromLatestReport(1, async () => null);
    assert.equal(result.generatedAt, null);
    assert.equal(result.bySku.size, 0);
  });

  it("maps sku to its impostoOperacionalMedioPercentual and the snapshot date", async () => {
    const payload = samplePayload([sampleSku()]);
    const result = await loadProductTaxFromLatestReport(1, async () => payload);

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
    const result = await loadProductTaxFromLatestReport(1, async () => payload);

    assert.ok(result.bySku.get("SKU-A"));
    assert.ok(result.bySku.get("OLD-SKU-A"));
  });

  it("returns undefined for a sku absent from the snapshot", async () => {
    const payload = samplePayload([sampleSku({ sku: "SKU-A" })]);
    const result = await loadProductTaxFromLatestReport(1, async () => payload);

    assert.equal(result.bySku.get("SKU-B"), undefined);
  });
});
