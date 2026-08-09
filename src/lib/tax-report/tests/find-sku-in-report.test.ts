import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalSkuFromReport,
  findSkuInReport,
} from "@/lib/tax-report/find-sku-in-report";
import type { SkuAggregation } from "@/lib/tax-report/types";

function row(sku: string, aliases: string[] = []): SkuAggregation {
  return {
    sku,
    skuAliases: aliases,
    quantidadeVendas: 1,
    unidadesVendidas: 1,
    receitaTotal: 100,
    impostoTotal: 10,
    impostoMedioPorVenda: 10,
    impostoMedioPercentual: 10,
    transacoes: [],
  };
}

describe("findSkuInReport", () => {
  it("finds canonical row directly", () => {
    const found = findSkuInReport([row("SKU-ATUAL", ["SKU-LEGADO"])], "SKU-ATUAL");
    assert.equal(found?.sku, "SKU-ATUAL");
  });

  it("finds row by alias", () => {
    const found = findSkuInReport([row("SKU-ATUAL", ["SKU-LEGADO"])], "SKU-LEGADO");
    assert.equal(found?.sku, "SKU-ATUAL");
  });

  it("prefers canonical row when legacy alias row still exists", () => {
    const found = findSkuInReport(
      [row("SKU-LEGADO"), row("SKU-ATUAL", ["SKU-LEGADO"])],
      "SKU-LEGADO",
    );
    assert.equal(found?.sku, "SKU-ATUAL");
  });

  it("finds canonical row when URL alias has double internal spaces", () => {
    const found = findSkuInReport(
      [
        row("MXT - Cabo 81063 10m (Próprio)", [
          "MXT - Cabo Guitar 10m (Próprio)",
        ]),
      ],
      "MXT  - Cabo Guitar 10m (Próprio)",
    );
    assert.equal(found?.sku, "MXT - Cabo 81063 10m (Próprio)");
  });

  it("trims URL sku with surrounding spaces", () => {
    const found = findSkuInReport(
      [row("SKU-ATUAL", ["SKU-LEGADO"])],
      "  SKU-LEGADO  ",
    );
    assert.equal(found?.sku, "SKU-ATUAL");
  });
});

describe("canonicalSkuFromReport", () => {
  it("returns canonical sku from alias lookup", () => {
    assert.equal(
      canonicalSkuFromReport([row("SKU-ATUAL", ["SKU-LEGADO"])], "SKU-LEGADO"),
      "SKU-ATUAL",
    );
  });
});
