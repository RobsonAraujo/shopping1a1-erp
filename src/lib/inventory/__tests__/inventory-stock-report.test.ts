import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateStockReportBySku,
  applyStockReportMergeGroups,
  buildStockReportRows,
  inventoryBaseUnits,
  listingAuditBreakdown,
  listingUnitsAtSnapshot,
  stockReportSalesAdjustmentRange,
} from "../inventory-stock-report";

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

  it("reconstructs own listing stock by adding sales after snapshot date", () => {
    assert.equal(
      listingUnitsAtSnapshot(
        {
          mlItemId: "MLB1",
          sku: "SKU A",
          title: "Produto",
          warehouseStock: 50,
          mlStock: 30,
          mlStockOnTheWay: 5,
          catalogListing: false,
        },
        {
          salesAfterSnapshot: 15,
          nfEmitidaNaoEntregue: 0,
          ajusteManual: 0,
        },
        { kind: "sales" },
      ),
      100,
    );
  });

  it("uses catalog snapshot ml stock without sales adjustment", () => {
    assert.equal(
      listingUnitsAtSnapshot(
        {
          mlItemId: "MLB1",
          sku: "SKU A",
          title: "Produto",
          warehouseStock: 10,
          mlStock: 999,
          mlStockOnTheWay: 0,
          catalogListing: true,
        },
        {
          salesAfterSnapshot: 50,
          nfEmitidaNaoEntregue: 0,
          ajusteManual: 0,
        },
        {
          kind: "catalog_snapshot",
          mlStockAtSnapshot: 90,
          snapshotAt: "2026-06-30T17:00:00.000Z",
        },
      ),
      100,
    );
  });

  it("applies manual negative adjustment and clamps at zero", () => {
    assert.equal(
      listingUnitsAtSnapshot(
        {
          mlItemId: "MLB1",
          sku: "SKU A",
          title: "Produto",
          warehouseStock: 100,
          mlStock: 0,
          mlStockOnTheWay: 0,
        },
        {
          salesAfterSnapshot: 0,
          nfEmitidaNaoEntregue: 0,
          ajusteManual: -50,
        },
        { kind: "sales" },
      ),
      50,
    );

    assert.equal(
      listingUnitsAtSnapshot(
        {
          mlItemId: "MLB1",
          sku: "SKU A",
          title: "Produto",
          warehouseStock: 10,
          mlStock: 0,
          mlStockOnTheWay: 0,
        },
        {
          salesAfterSnapshot: 0,
          nfEmitidaNaoEntregue: 0,
          ajusteManual: -50,
        },
        { kind: "sales" },
      ),
      0,
    );
  });

  it("adds nf and manual extras to listing units", () => {
    assert.equal(
      listingUnitsAtSnapshot(
        {
          mlItemId: "MLB1",
          sku: "SKU A",
          title: "Produto",
          warehouseStock: 100,
          mlStock: 50,
          mlStockOnTheWay: 0,
        },
        {
          salesAfterSnapshot: 10,
          nfEmitidaNaoEntregue: 20,
          ajusteManual: 30,
        },
        { kind: "sales" },
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
      {},
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
      {
        id: "merge-1",
        skuKeys: ["SKU A", "SKU B"],
        anchorSkuKey: "SKU A",
        label: "Grupo AB",
      },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.label, "Grupo AB");
    assert.equal(merged[0]?.units, 8);
    assert.equal(merged[0]?.stockValue, 110);
    assert.equal(merged[0]?.unitCost, 13.75);
    assert.equal(merged[0]?.ncm, "11111111");
  });

  it("uses anchor sku label and ncm when group label is omitted", () => {
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
        ncm: "22222222",
        unitCost: 20,
        units: 3,
        stockValue: 60,
        missingCost: false,
      },
    ];

    const merged = applyStockReportMergeGroups(baseRows, [
      {
        id: "merge-1",
        skuKeys: ["SKU A", "SKU B"],
        anchorSkuKey: "SKU A",
      },
    ]);

    assert.equal(merged[0]?.label, "SKU A");
    assert.equal(merged[0]?.ncm, "11111111");
  });

  it("ncm override prevails over anchor ncm", () => {
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
        ncm: "22222222",
        unitCost: 20,
        units: 3,
        stockValue: 60,
        missingCost: false,
      },
    ];

    const merged = applyStockReportMergeGroups(baseRows, [
      {
        id: "merge-1",
        skuKeys: ["SKU A", "SKU B"],
        anchorSkuKey: "SKU A",
        ncmOverride: "99999999",
      },
    ]);

    assert.equal(merged[0]?.ncm, "99999999");
  });

  it("excludes zero-stock listings unless extras add units", () => {
    const withoutExtras = aggregateStockReportBySku(
      [
        {
          mlItemId: "MLB1",
          sku: "ZERADO",
          title: "Z",
          warehouseStock: 0,
          mlStock: 0,
          mlStockOnTheWay: 0,
        },
        {
          mlItemId: "MLB2",
          sku: "COM ESTOQUE",
          title: "C",
          warehouseStock: 3,
          mlStock: 0,
          mlStockOnTheWay: 0,
        },
      ],
      {},
      {
        ZERADO: { ncm: "1", unitCost: 10, hasIcmsSt: false },
        "COM ESTOQUE": { ncm: "2", unitCost: 10, hasIcmsSt: false },
      },
    );
    assert.equal(withoutExtras.length, 1);
    assert.equal(withoutExtras[0]?.label, "COM ESTOQUE");

    const withExtras = aggregateStockReportBySku(
      [
        {
          mlItemId: "MLB1",
          sku: "ZERADO",
          title: "Z",
          warehouseStock: 0,
          mlStock: 0,
          mlStockOnTheWay: 0,
        },
      ],
      {
        MLB1: {
          adjustment: {
            salesAfterSnapshot: 0,
            nfEmitidaNaoEntregue: 0,
            ajusteManual: 5,
          },
          snapshotSource: { kind: "sales" },
        },
      },
      {
        ZERADO: { ncm: "1", unitCost: 10, hasIcmsSt: false },
      },
    );
    assert.equal(withExtras.length, 1);
    assert.equal(withExtras[0]?.units, 5);
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

  it("returns sales adjustment range starting day after snapshot", () => {
    const snapshot = new Date("2026-06-30T23:59:59.999-03:00");
    const asOf = new Date("2026-07-02T12:00:00.000-03:00");
    const range = stockReportSalesAdjustmentRange(
      snapshot,
      asOf,
      "America/Sao_Paulo",
    );
    assert.ok(range);
    assert.equal(
      range.from.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      "2026-07-01",
    );
    assert.equal(range.to.getTime(), asOf.getTime());
  });

  it("listingAuditBreakdown exposes every component used to reach the total (sales source)", () => {
    const audit = listingAuditBreakdown(
      {
        mlItemId: "MLB1",
        sku: "SKU A",
        title: "Produto",
        warehouseStock: 4,
        mlStock: 10,
        mlStockOnTheWay: 2,
        catalogListing: false,
      },
      {
        adjustment: {
          salesAfterSnapshot: 6,
          nfEmitidaNaoEntregue: 1,
          ajusteManual: -2,
        },
        snapshotSource: { kind: "sales" },
      },
    );
    assert.deepEqual(audit, {
      warehouseStock: 4,
      mlStockOnTheWay: 2,
      mlStockToday: 10,
      mlStockSource: "today",
      mlStockAtSnapshot: null,
      snapshotAt: null,
      salesAfterSnapshot: 6,
      nfEmitidaNaoEntregue: 1,
      ajusteManual: -2,
      total: 21,
    });
  });

  it("listingAuditBreakdown zeroes sales and reports the snapshot value (catalog source)", () => {
    const audit = listingAuditBreakdown(
      {
        mlItemId: "MLB1",
        sku: "SKU A",
        title: "Produto",
        warehouseStock: 3,
        mlStock: 999,
        mlStockOnTheWay: 1,
        catalogListing: true,
      },
      {
        adjustment: {
          salesAfterSnapshot: 50,
          nfEmitidaNaoEntregue: 0,
          ajusteManual: 0,
        },
        snapshotSource: {
          kind: "catalog_snapshot",
          mlStockAtSnapshot: 8,
          snapshotAt: "2026-07-31T23:00:00.000Z",
        },
      },
    );
    assert.equal(audit.mlStockSource, "catalog_snapshot");
    assert.equal(audit.mlStockAtSnapshot, 8);
    assert.equal(audit.mlStockToday, 999);
    assert.equal(audit.salesAfterSnapshot, 0);
    assert.equal(audit.snapshotAt, "2026-07-31T23:00:00.000Z");
    assert.equal(audit.total, 3 + 8 + 1);
  });
});
