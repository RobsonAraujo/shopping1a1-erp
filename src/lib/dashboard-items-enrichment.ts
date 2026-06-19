import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type CatalogListingInfo = {
  catalogStatus: string | null;
  catalogSellerPrice: number | null;
  catalogPriceToWin: number | null;
  catalogPolledAt: Date | null;
};

export type OpenCycleInfo = {
  id: string;
  kind: OperationCycleKind;
  status: ReplenishmentStatus;
};

export type DashboardItemsEnrichment = {
  warehouseById: Record<string, number>;
  leadTimeById: Record<string, number | null>;
  catalogById: Record<string, CatalogListingInfo>;
  openCycleById: Record<string, OpenCycleInfo>;
};

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadDashboardItemsEnrichment(
  allIds: string[],
  catalogIds: string[],
): Promise<DashboardItemsEnrichment> {
  const warehouseById: Record<string, number> = {};
  const leadTimeById: Record<string, number | null> = {};
  const catalogById: Record<string, CatalogListingInfo> = {};
  const openCycleById: Record<string, OpenCycleInfo> = {};

  if (allIds.length === 0) {
    return { warehouseById, leadTimeById, catalogById, openCycleById };
  }

  const [stocks, listings, cycles] = await Promise.all([
    prisma.warehouseStock.findMany({
      where: { mlItemId: { in: allIds } },
      select: {
        mlItemId: true,
        quantity: true,
        purchaseLeadTimeDays: true,
      },
    }),
    catalogIds.length > 0
      ? prisma.listing.findMany({
          where: { mlItemId: { in: catalogIds } },
          select: {
            mlItemId: true,
            catalogStatus: true,
            catalogSellerPrice: true,
            catalogPriceToWin: true,
            catalogPolledAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.replenishmentCycle.findMany({
      where: {
        mlItemId: { in: allIds },
        status: { not: "completed" },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        mlItemId: true,
        kind: true,
        status: true,
      },
    }),
  ]);

  for (const row of stocks) {
    warehouseById[row.mlItemId] = row.quantity;
    leadTimeById[row.mlItemId] = row.purchaseLeadTimeDays;
  }

  for (const row of listings) {
    catalogById[row.mlItemId] = {
      catalogStatus: row.catalogStatus,
      catalogSellerPrice: decimalToNumber(row.catalogSellerPrice),
      catalogPriceToWin: decimalToNumber(row.catalogPriceToWin),
      catalogPolledAt: row.catalogPolledAt,
    };
  }

  for (const row of cycles) {
    if (!openCycleById[row.mlItemId]) {
      openCycleById[row.mlItemId] = {
        id: row.id,
        kind: row.kind,
        status: row.status,
      };
    }
  }

  return { warehouseById, leadTimeById, catalogById, openCycleById };
}
