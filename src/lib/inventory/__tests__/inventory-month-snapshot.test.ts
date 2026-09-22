import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveInventorySnapshotTargetMonth } from "../inventory-month-snapshot";
import { buildInventoryMonthSnapshotReport } from "../inventory-month-snapshot-report";
import type { InventoryStockMonthSnapshot } from "@/generated/prisma/client";

type SnapshotRowFixture = Omit<InventoryStockMonthSnapshot, "unitCost"> & {
  unitCost: number | null;
};

function makeSnapshotRow(
  overrides: Partial<SnapshotRowFixture>,
): InventoryStockMonthSnapshot {
  const row: SnapshotRowFixture = {
    id: "snap1",
    organizationId: "org1",
    year: 2026,
    month: 8,
    mlItemId: "MLB1",
    sku: "SKU A",
    title: "Produto A",
    ncm: "12345678",
    unitCost: 10,
    warehouseStock: 5,
    mlStock: 3,
    mlStockOnTheWay: 0,
    catalogListing: false,
    inventoryIds: [],
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
  return row as unknown as InventoryStockMonthSnapshot;
}

describe("resolveInventorySnapshotTargetMonth", () => {
  it("targets the previous month regardless of the day within the current month", () => {
    const target = resolveInventorySnapshotTargetMonth(
      new Date("2026-09-15T12:00:00Z"),
    );
    assert.deepEqual(target, { year: 2026, month: 8 });
  });

  it("rolls back the year in January", () => {
    const target = resolveInventorySnapshotTargetMonth(
      new Date("2026-01-05T12:00:00Z"),
    );
    assert.deepEqual(target, { year: 2025, month: 12 });
  });
});

describe("buildInventoryMonthSnapshotReport", () => {
  it("sums frozen units across listings sharing the same sku, no live adjustment", () => {
    const rows = [
      makeSnapshotRow({
        mlItemId: "MLB1",
        sku: "SKU A",
        warehouseStock: 5,
        mlStock: 3,
        mlStockOnTheWay: 2,
        unitCost: 10,
      }),
      makeSnapshotRow({
        mlItemId: "MLB2",
        sku: "SKU A",
        warehouseStock: 1,
        mlStock: 0,
        mlStockOnTheWay: 0,
        unitCost: 10,
      }),
    ];

    const result = buildInventoryMonthSnapshotReport(rows);

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].units, 11);
    assert.equal(result.rows[0].stockValue, 110);
    assert.equal(result.totalValue, 110);
    assert.equal(result.missingCostCount, 0);
  });

  it("does not double count ml stock when 2 listings of the same sku share a fulfillment inventory_id", () => {
    const rows = [
      makeSnapshotRow({
        mlItemId: "MLB7680193850",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        warehouseStock: 0,
        mlStock: 100,
        mlStockOnTheWay: 5,
        inventoryIds: ["FULL-INV-1"],
        unitCost: null,
      }),
      makeSnapshotRow({
        mlItemId: "MLB5713296080",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        warehouseStock: 580,
        mlStock: 100,
        mlStockOnTheWay: 5,
        inventoryIds: ["FULL-INV-1"],
        unitCost: 10,
      }),
    ];

    const result = buildInventoryMonthSnapshotReport(rows);

    // 580 (galpão, aditivo) + 100 (Full, só 1x) + 5 (a caminho, só 1x) = 685
    // — sem o fix somaria 790 (Full/a-caminho contados 2x).
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].units, 685);
  });

  it("still sums ml stock when 2 listings of the same sku have different fulfillment inventory_id (genuinely separate pools)", () => {
    const rows = [
      makeSnapshotRow({
        mlItemId: "MLB1",
        sku: "SKU A",
        warehouseStock: 100,
        mlStock: 400,
        mlStockOnTheWay: 39,
        inventoryIds: ["FULL-INV-1"],
        unitCost: 42.75,
      }),
      makeSnapshotRow({
        mlItemId: "MLB2",
        sku: "SKU A",
        warehouseStock: 0,
        mlStock: 1000,
        mlStockOnTheWay: 0,
        inventoryIds: ["FULL-INV-2"],
        unitCost: 42.75,
      }),
    ];

    const result = buildInventoryMonthSnapshotReport(rows);

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].units, 1539);
  });

  it("flags rows without a frozen cost as missingCost and excludes them from the total", () => {
    const rows = [
      makeSnapshotRow({
        mlItemId: "MLB3",
        sku: "SKU B",
        warehouseStock: 4,
        mlStock: 0,
        unitCost: null,
      }),
    ];

    const result = buildInventoryMonthSnapshotReport(rows);

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].missingCost, true);
    assert.equal(result.rows[0].stockValue, null);
    assert.equal(result.totalValue, 0);
    assert.equal(result.missingCostCount, 1);
  });
});
