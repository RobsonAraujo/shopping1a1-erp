import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ItemSaleEvent } from "@/lib/mercadolibre/api";

const MOCK_FILE = path.join(process.cwd(), ".mock", "catalog-report-sales.json");

type MockSalesFile = {
  mlItemId: string;
  events: Array<{ at: string; units: number }>;
};

export function isCatalogMockSalesEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.CATALOG_MOCK_SALES?.trim() === "0") return false;
  return true;
}

export async function loadCatalogMockSaleEvents(
  mlItemId: string,
): Promise<ItemSaleEvent[] | null> {
  if (!isCatalogMockSalesEnabled()) return null;

  try {
    const raw = JSON.parse(await readFile(MOCK_FILE, "utf8")) as MockSalesFile;
    if (raw.mlItemId !== mlItemId || !Array.isArray(raw.events)) return null;

    return raw.events
      .map((event) => ({
        at: new Date(event.at),
        units: event.units,
      }))
      .filter((event) => !Number.isNaN(event.at.getTime()) && event.units > 0);
  } catch {
    return null;
  }
}

export const catalogReportMockSalesPath = MOCK_FILE;
