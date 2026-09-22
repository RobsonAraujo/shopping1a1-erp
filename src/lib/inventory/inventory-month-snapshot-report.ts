import { prisma } from "@/lib/db/db";
import {
  buildStockReportRows,
  skuKeyFromListing,
  type StockReportBuildResult,
  type StockReportListingInput,
  type StockReportListingState,
  type StockReportMergeGroup,
  type StockReportProductInfo,
} from "@/lib/inventory/inventory-stock-report";
import type {
  InventoryMonthSnapshotSource,
  InventoryStockMonthSnapshot,
} from "@/generated/prisma/client";

export type InventorySnapshotMonthRef = { year: number; month: number };

export type InventoryMonthSnapshotStatusSummary = {
  year: number;
  month: number;
  itemsSnapshotted: number;
  completedAt: Date | null;
  /** "auto" = fechamento oficial de fim de mês; "manual" = disparado pelo usuário, provisório até o fechamento oficial desse mês acontecer. */
  source: InventoryMonthSnapshotSource;
};

/** Meses com snapshot fechado (status "done") disponíveis pra organização, mais recentes primeiro — alimenta o seletor de mês da tela de Histórico. */
export async function listClosedInventorySnapshotMonths(
  organizationId: string,
): Promise<InventoryMonthSnapshotStatusSummary[]> {
  const runs = await prisma.inventoryMonthSnapshotRun.findMany({
    where: { organizationId, status: "done" },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      year: true,
      month: true,
      itemsSnapshotted: true,
      completedAt: true,
      source: true,
    },
  });
  return runs;
}

export async function loadInventoryMonthSnapshotRows(
  organizationId: string,
  year: number,
  month: number,
): Promise<InventoryStockMonthSnapshot[]> {
  return prisma.inventoryStockMonthSnapshot.findMany({
    where: { organizationId, year, month },
    orderBy: { title: "asc" },
  });
}

export function inventoryMonthSnapshotKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export type InventoryMonthSnapshotEvolutionRow = {
  skuKey: string;
  label: string;
  unitsByMonthKey: Record<string, number>;
  valueByMonthKey: Record<string, number | null>;
};

export type InventoryMonthSnapshotEvolution = {
  monthKeys: string[];
  rows: InventoryMonthSnapshotEvolutionRow[];
};

/**
 * Evolução mês a mês por SKU (unidades e valor) a partir dos snapshots
 * fechados — 1 query cobrindo todos os meses pedidos, agrupada em memória
 * (evita N round-trips). Reaproveita `buildInventoryMonthSnapshotReport`
 * por mês pra já sair com o mesmo agrupamento/merge do relatório normal.
 */
export async function loadInventoryMonthSnapshotEvolution(
  organizationId: string,
  months: InventorySnapshotMonthRef[],
  mergeGroups: StockReportMergeGroup[] = [],
): Promise<InventoryMonthSnapshotEvolution> {
  if (months.length === 0) return { monthKeys: [], rows: [] };

  const allRows = await prisma.inventoryStockMonthSnapshot.findMany({
    where: {
      organizationId,
      OR: months.map((m) => ({ year: m.year, month: m.month })),
    },
    orderBy: { title: "asc" },
  });

  const monthKeys = months.map((m) => inventoryMonthSnapshotKey(m.year, m.month));
  const rowsByMonthKey = new Map<string, InventoryStockMonthSnapshot[]>();
  for (const key of monthKeys) rowsByMonthKey.set(key, []);
  for (const row of allRows) {
    rowsByMonthKey.get(inventoryMonthSnapshotKey(row.year, row.month))?.push(row);
  }

  const rowsBySkuKey = new Map<string, InventoryMonthSnapshotEvolutionRow>();
  for (const key of monthKeys) {
    const report = buildInventoryMonthSnapshotReport(
      rowsByMonthKey.get(key) ?? [],
      {},
      mergeGroups,
    );
    for (const reportRow of report.rows) {
      const existing = rowsBySkuKey.get(reportRow.rowKey) ?? {
        skuKey: reportRow.rowKey,
        label: reportRow.label,
        unitsByMonthKey: {},
        valueByMonthKey: {},
      };
      existing.unitsByMonthKey[key] = reportRow.units;
      existing.valueByMonthKey[key] = reportRow.stockValue;
      rowsBySkuKey.set(reportRow.rowKey, existing);
    }
  }

  const rows = [...rowsBySkuKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
  );
  return { monthKeys, rows };
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type InventoryMonthSnapshotListingInputs = {
  listings: StockReportListingInput[];
  productsBySku: Record<string, StockReportProductInfo>;
};

/**
 * Adapta as linhas congeladas do snapshot pro mesmo formato que a UI
 * interativa do relatório consome (`StockReportListingInput` +
 * `productsBySku`) — a partir daqui a tela de Histórico aplica localmente
 * merge de SKU e ajustes manuais (não-persistidos) do mesmo jeito que o
 * relatório fazia com dado ao vivo, só que sobre dado congelado.
 */
export function buildInventoryMonthSnapshotListingInputs(
  rows: InventoryStockMonthSnapshot[],
): InventoryMonthSnapshotListingInputs {
  const listings: StockReportListingInput[] = [];
  const productsBySku: Record<string, StockReportProductInfo> = {};

  for (const row of rows) {
    listings.push({
      mlItemId: row.mlItemId,
      sku: row.sku,
      title: row.title,
      mlStock: row.mlStock,
      warehouseStock: row.warehouseStock,
      mlStockOnTheWay: row.mlStockOnTheWay,
      catalogListing: row.catalogListing,
    });

    const skuKey = skuKeyFromListing(row.sku, row.mlItemId);
    if (!productsBySku[skuKey]) {
      productsBySku[skuKey] = {
        ncm: row.ncm,
        // Custo já congelado no momento do fechamento — hasIcmsSt não é
        // usado depois daqui (buildStockReportRows só lê unitCost/ncm).
        unitCost: decimalToNumber(row.unitCost),
        hasIcmsSt: false,
      };
    }
  }

  return { listings, productsBySku };
}

/**
 * Monta o relatório de um mês fechado a partir do snapshot congelado —
 * mesma pipeline de agregação/merge do relatório ao vivo
 * (`buildStockReportRows`), sem duplicar nada dela. `listingStatesByMlItemId`
 * é opcional: os números já SÃO os do fechamento (sem "vendas depois da
 * data" pra somar de volta), então só existe pra permitir as correções
 * locais e não-persistidas (NF não entregue, ajuste manual) que o usuário
 * pode aplicar ao gerar o relatório na tela de Histórico.
 */
export function buildInventoryMonthSnapshotReport(
  rows: InventoryStockMonthSnapshot[],
  listingStatesByMlItemId: Record<string, StockReportListingState | undefined> = {},
  mergeGroups: StockReportMergeGroup[] = [],
): StockReportBuildResult {
  const { listings, productsBySku } = buildInventoryMonthSnapshotListingInputs(rows);
  return buildStockReportRows(
    listings,
    listingStatesByMlItemId,
    productsBySku,
    mergeGroups,
  );
}
