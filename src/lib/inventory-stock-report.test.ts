import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateStockReportBySku,
  applyStockReportMergeGroups,
  buildStockReportRows,
  inventoryBaseUnits,
  listingTotalUnits,
} from "./inventory-stock-report";

describe("inventory-stock-report", () => {
  it("computes base units from warehouse, full and on the way", () => {
    assert.equal(
      inventoryBaseUnits({
        warehouseStock: 10,
        mlStock: 20,
        mlStockOnTheWay: 5,
      }),
      35,
    );
  });

  it("adds optional extras to listing units", () => {
    assert.equal(
      listingTotalUnits(
        {
          mlItemId: "MLB1",
          sku: "SKU A",
          title: "Produto",
          warehouseStock: 100,
          mlStock: 50,
          mlStockOnTheWay: 0,
        },
        {
          vendasMesSeguinte: 10,
          nfEmitidaNaoEntregue: 20,
          estoqueExtra: 30,
        },
      ),
      210,
    );
  });

  it("aggregates listings by sku with unit cost", () => {
    const rows = aggregateStockReportBySku(
      [
        {
          mlItemId: "MLB1",
          sku: "TECNIFORTE - Cabo",
          title: "Anúncio 1",
          warehouseStock: 100,
          mlStock: 400,
          mlStockOnTheWay: 39,
        },
        {
          mlItemId: "MLB2",
          sku: "TECNIFORTE - Cabo",
          title: "Anúncio 2",
          warehouseStock: 0,
          mlStock: 1000,
          mlStockOnTheWay: 0,
        },
      ],
      {
        MLB1: {
          vendasMesSeguinte: 0,
          nfEmitidaNaoEntregue: 0,
          estoqueExtra: 0,
        },
      },
      {
        "TECNIFORTE - Cabo": {
          ncm: "85444200",
          unitCost: 42.75,
          hasIcmsSt: false,
        },
      },
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.units, 1539);
    assert.equal(rows[0]?.unitCost, 42.75);
    assert.equal(rows[0]?.stockValue, 65792.25);
  });

  it("merges selected sku rows into one line", () => {
    const baseRows = [
      {
        rowKey: "SKU A",
        label: "SKU A",
        skus: ["SKU A"],
        ncm: "11111111",
        unitCost: 10,
        units: 5,
        stockValue: 50,
        missingCost: false,
      },
      {
        rowKey: "SKU B",
        label: "SKU B",
        skus: ["SKU B"],
        ncm: "11111111",
        unitCost: 20,
        units: 3,
        stockValue: 60,
        missingCost: false,
      },
    ];

    const merged = applyStockReportMergeGroups(baseRows, [
      { id: "merge-1", skuKeys: ["SKU A", "SKU B"], label: "Grupo AB" },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.label, "Grupo AB");
    assert.equal(merged[0]?.units, 8);
    assert.equal(merged[0]?.stockValue, 110);
    assert.equal(merged[0]?.unitCost, 13.75);
  });

  it("builds total value excluding rows without cost", () => {
    const result = buildStockReportRows(
      [
        {
          mlItemId: "MLB1",
          sku: "COM CUSTO",
          title: "A",
          warehouseStock: 2,
          mlStock: 0,
          mlStockOnTheWay: 0,
        },
        {
          mlItemId: "MLB2",
          sku: "SEM CUSTO",
          title: "B",
          warehouseStock: 5,
          mlStock: 0,
          mlStockOnTheWay: 0,
        },
      ],
      {},
      {
        "COM CUSTO": {
          ncm: "123",
          unitCost: 10,
          hasIcmsSt: false,
        },
      },
    );

    assert.equal(result.rows.length, 2);
    assert.equal(result.totalValue, 20);
    assert.equal(result.missingCostCount, 1);
  });
});
