import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateStockReportBySku,
  applyStockReportMergeGroups,
  buildStockReportRows,
  consolidateListingsBySku,
  inventoryBaseUnits,
  listingAuditBreakdown,
  listingTotalUnits,
  listingUnitsAtSnapshot,
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
          nfEmitidaNaoEntregue: 0,
          ajusteManual: -50,
        },
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
          nfEmitidaNaoEntregue: 0,
          ajusteManual: -50,
        },
      ),
      0,
    );
  });

  it("adds nf and manual extras to the frozen base units", () => {
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
          nfEmitidaNaoEntregue: 20,
          ajusteManual: 30,
        },
      ),
      200,
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

  it("does not double count ml stock when listings of the same sku share an inventory_id", () => {
    const rows = aggregateStockReportBySku(
      [
        {
          mlItemId: "MLB1",
          sku: "TECNIFORTE - Cabo",
          title: "Anúncio 1",
          warehouseStock: 0,
          mlStock: 100,
          mlStockOnTheWay: 5,
          inventoryIds: ["FULL-INV-1"],
        },
        {
          mlItemId: "MLB2",
          sku: "TECNIFORTE - Cabo",
          title: "Anúncio 2",
          warehouseStock: 580,
          mlStock: 100,
          mlStockOnTheWay: 5,
          inventoryIds: ["FULL-INV-1"],
        },
      ],
      {},
      {
        "TECNIFORTE - Cabo": {
          ncm: "85444200",
          unitCost: 10,
          hasIcmsSt: false,
        },
      },
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.units, 685);
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
            nfEmitidaNaoEntregue: 0,
            ajusteManual: 5,
          },
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

  it("consolidates 2 listings of the same sku into one product, Full counted once", () => {
    const groups = consolidateListingsBySku([
      {
        mlItemId: "MLB7680193850",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        title: "Alltec 2001",
        warehouseStock: 0,
        mlStock: 100,
        mlStockOnTheWay: 5,
        inventoryIds: ["FULL-INV-1"],
      },
      {
        mlItemId: "MLB5713296080",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        title: "Alltec 2001",
        warehouseStock: 580,
        mlStock: 100,
        mlStockOnTheWay: 5,
        inventoryIds: ["FULL-INV-1"],
      },
    ]);

    assert.equal(groups.length, 1);
    const group = groups[0]!;
    assert.equal(group.warehouseStock, 580); // somado
    assert.equal(group.mlStock, 100); // contado 1x (mesmo pool)
    assert.equal(group.mlStockOnTheWay, 5); // contado 1x
    assert.deepEqual(group.mlItemIds, ["MLB7680193850", "MLB5713296080"]);
    // âncora é quem recebe os ajustes manuais do produto
    assert.equal(group.mlItemId, "MLB7680193850");
  });

  it("consolidates but keeps summing Full when the pools are genuinely separate", () => {
    const groups = consolidateListingsBySku([
      {
        mlItemId: "MLB1",
        sku: "SKU A",
        title: "A",
        warehouseStock: 100,
        mlStock: 400,
        mlStockOnTheWay: 39,
        inventoryIds: ["FULL-INV-1"],
      },
      {
        mlItemId: "MLB2",
        sku: "SKU A",
        title: "A",
        warehouseStock: 0,
        mlStock: 1000,
        mlStockOnTheWay: 0,
        inventoryIds: ["FULL-INV-2"],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.warehouseStock, 100);
    assert.equal(groups[0]?.mlStock, 1400);
    assert.equal(groups[0]?.mlStockOnTheWay, 39);
  });

  it("never groups listings without sku", () => {
    const groups = consolidateListingsBySku([
      { mlItemId: "MLB1", sku: null, title: "A", warehouseStock: 1, mlStock: 0, mlStockOnTheWay: 0 },
      { mlItemId: "MLB2", sku: null, title: "B", warehouseStock: 2, mlStock: 0, mlStockOnTheWay: 0 },
    ]);

    assert.equal(groups.length, 2);
  });

  it("product total matches the report total (adjustments modal must not contradict the report)", () => {
    // Regressão do caso real: a modal de Ajustes e a memória de cálculo
    // mostravam os anúncios brutos (Full contado 2x) enquanto o relatório já
    // deduplicava — as telas não fechavam a mesma conta.
    const listings = [
      {
        mlItemId: "MLB7680193850",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        title: "Alltec 2001",
        warehouseStock: 0,
        mlStock: 100,
        mlStockOnTheWay: 5,
        inventoryIds: ["FULL-INV-1"],
      },
      {
        mlItemId: "MLB5713296080",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        title: "Alltec 2001",
        warehouseStock: 580,
        mlStock: 100,
        mlStockOnTheWay: 5,
        inventoryIds: ["FULL-INV-1"],
      },
    ];

    const reportRows = aggregateStockReportBySku(listings, {}, {});
    const groups = consolidateListingsBySku(listings);

    assert.equal(reportRows.length, 1);
    assert.equal(groups.length, 1);
    // o número que a modal/memória mostram para o produto...
    const groupUnits = listingTotalUnits(groups[0]!, {
      adjustment: { nfEmitidaNaoEntregue: 0, ajusteManual: 0 },
    });
    // ...tem que ser exatamente o do relatório
    assert.equal(groupUnits, reportRows[0]?.units);
    assert.equal(groupUnits, 685);
  });

  it("listingAuditBreakdown exposes every component used to reach the total", () => {
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
          nfEmitidaNaoEntregue: 1,
          ajusteManual: -2,
        },
      },
    );
    assert.deepEqual(audit, {
      warehouseStock: 4,
      mlStock: 10,
      mlStockOnTheWay: 2,
      nfEmitidaNaoEntregue: 1,
      ajusteManual: -2,
      total: 15,
    });
  });
});
