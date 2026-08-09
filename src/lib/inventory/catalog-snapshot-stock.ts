import { reportsConfig } from "@/config/reports";
import { dayKeyInTimezone } from "@/lib/catalog-competition";
import { prisma } from "@/lib/db";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { getZonedParts, zonedLocalToUtc } from "@/lib/report-timezone";

export function extractMlStockFromCatalogSnapshot(
  rawResponse: unknown,
): number | null {
  if (!rawResponse || typeof rawResponse !== "object") return null;
  const raw = rawResponse as Record<string, unknown>;
  const item = raw.item;
  if (!item || typeof item !== "object") return null;
  return mlAvailableStockUnits(item as ItemBody);
}

export async function loadCatalogMlStockAtOrBefore(
  mlItemIds: string[],
  asOfDate: Date,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): Promise<Map<string, { mlStock: number; snapshotAt: Date }>> {
  const unique = [...new Set(mlItemIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const targetDayKey = dayKeyInTimezone(asOfDate, timeZone);
  const parts = getZonedParts(asOfDate, timeZone);
  const endOfDay = zonedLocalToUtc(
    parts.year,
    parts.month,
    parts.day,
    23,
    59,
    59,
    999,
    timeZone,
  );

  const rows = await prisma.catalogCompetitionSnapshot.findMany({
    where: {
      mlItemId: { in: unique },
      snapshotAt: { lte: endOfDay },
    },
    orderBy: { snapshotAt: "desc" },
    select: {
      mlItemId: true,
      snapshotAt: true,
      rawResponse: true,
    },
  });

  const result = new Map<string, { mlStock: number; snapshotAt: Date }>();
  for (const row of rows) {
    if (result.has(row.mlItemId)) continue;
    if (dayKeyInTimezone(row.snapshotAt, timeZone) !== targetDayKey) continue;
    const mlStock = extractMlStockFromCatalogSnapshot(row.rawResponse);
    if (mlStock === null) continue;
    result.set(row.mlItemId, { mlStock, snapshotAt: row.snapshotAt });
  }

  return result;
}
