/**
 * Seeds catalog competition snapshots + mock sale events for local UI testing.
 *
 * Usage:
 *   npm run seed:catalog-demo
 *   npm run seed:catalog-demo -- MLB1234567890
 *
 * Then set CATALOG_MOCK_SALES=1 in .env, restart dev server, and open:
 *   /dashboard/catalog-report/<ITEM_ID>
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db/db";
import { catalogReportMockSalesPath } from "../src/lib/catalog-report/catalog-report-mock-sales";
import { atReportTime } from "../src/lib/report-timezone";
import { reportsConfig } from "../src/config/reports";

const DEFAULT_ITEM_ID = "MLB4561866095";
const TZ = reportsConfig.catalogCompetitionTimezone;

type Status = "losing" | "shared" | "winning";

type SnapshotSeed = {
  status: Status;
  at: Date;
  sellerPrice: number;
  priceToWin: number;
};

type SaleSeed = {
  at: Date;
  units: number;
  note: string;
};

function atDayTime(
  base: Date,
  dayOffset: number,
  hour: number,
  minute = 0,
): Date {
  return atReportTime(base, dayOffset, hour, minute, TZ);
}

function mlStatus(status: Status): string {
  if (status === "losing") return "competing";
  if (status === "shared") return "sharing_first_place";
  return "winning";
}

function visitShare(status: Status): string {
  if (status === "losing") return "minimum";
  if (status === "shared") return "medium";
  return "maximum";
}

function buildDaySnapshots(dayOffset: number, now: Date): SnapshotSeed[] {
  const sellerWhileLosing = 40.1 + dayOffset;
  const winWhileLosing = 36.96 + dayOffset * 0.5;
  const sellerWhileShared = 38.5 + dayOffset;
  const winWhileShared = 37.2 + dayOffset * 0.5;
  const sellerWhileWinning = 36.96 + dayOffset * 0.5;
  const winWhileWinning = 36.96 + dayOffset * 0.5;

  return [
    {
      status: "losing",
      at: atDayTime(now, dayOffset, 9, 0),
      sellerPrice: sellerWhileLosing,
      priceToWin: winWhileLosing,
    },
    {
      status: "shared",
      at: atDayTime(now, dayOffset, 14, 0),
      sellerPrice: sellerWhileShared,
      priceToWin: winWhileShared,
    },
    {
      status: "winning",
      at: atDayTime(now, dayOffset, 19, 0),
      sellerPrice: sellerWhileWinning,
      priceToWin: winWhileWinning,
    },
  ];
}

function buildDaySales(dayOffset: number, now: Date): SaleSeed[] {
  const losingUnits = dayOffset === 0 ? 1 : dayOffset === 1 ? 2 : 0;
  const sharedUnits = dayOffset === 0 ? 3 : 1;
  const sharedExtra = dayOffset === 1 ? 2 : 0;
  const winningFirst = dayOffset === 0 ? 5 : 4;
  const winningSecond = dayOffset === 0 ? 7 : 3;

  return [
    losingUnits > 0
      ? {
          at: atDayTime(now, dayOffset, 10, 30),
          units: losingUnits,
          note: "while losing (09:00–14:00)",
        }
      : null,
    sharedUnits > 0
      ? {
          at: atDayTime(now, dayOffset, 15, 30),
          units: sharedUnits,
          note: "while shared (14:00–19:00)",
        }
      : null,
    sharedExtra > 0
      ? {
          at: atDayTime(now, dayOffset, 16, 45),
          units: sharedExtra,
          note: "while shared (14:00–19:00)",
        }
      : null,
    {
      at: atDayTime(now, dayOffset, 20, 10),
      units: winningFirst,
      note: "while winning (19:00+)",
    },
    {
      at: atDayTime(now, dayOffset, 21, 30),
      units: winningSecond,
      note: "while winning (19:00+)",
    },
  ].filter((sale): sale is SaleSeed => sale !== null);
}

async function main() {
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!organization) {
    throw new Error(
      "Nenhuma Organization encontrada — faça login OAuth (cria a org) e rode o seed de novo.",
    );
  }
  const organizationId = organization.id;

  const itemId = process.argv[2]?.trim() || DEFAULT_ITEM_ID;
  const now = new Date();
  const snapshots: SnapshotSeed[] = [];
  const sales: SaleSeed[] = [];

  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    snapshots.push(...buildDaySnapshots(dayOffset, now));
    sales.push(...buildDaySales(dayOffset, now));
  }

  await prisma.listing.upsert({
    where: { mlItemId: itemId },
    create: {
      mlItemId: itemId,
      organizationId,
      titleSnapshot: "Demo catálogo — timeline + vendas mock",
      skuSnapshot: `SKU-DEMO-${itemId.slice(-6)}`,
      imageUrlSnapshot: null,
      catalogListing: true,
      activeOnMl: true,
      lastSyncedAt: now,
    },
    update: {
      titleSnapshot: "Demo catálogo — timeline + vendas mock",
      skuSnapshot: `SKU-DEMO-${itemId.slice(-6)}`,
      catalogListing: true,
      activeOnMl: true,
      lastSyncedAt: now,
    },
  });

  await prisma.catalogCompetitionSnapshot.deleteMany({
    where: { mlItemId: itemId },
  });

  for (const point of snapshots) {
    await prisma.catalogCompetitionSnapshot.create({
      data: {
        mlItemId: itemId,
        organizationId,
        status: point.status,
        source: "manual_poll",
        snapshotAt: point.at,
        sellerPrice: String(point.sellerPrice),
        priceToWin: String(point.priceToWin),
        rawResponse: {
          priceToWin: {
            status: mlStatus(point.status),
            current_price: point.sellerPrice,
            price_to_win: point.priceToWin,
            visit_share: visitShare(point.status),
          },
          item: { price: point.sellerPrice },
        },
      },
    });
  }

  const lastSnapshot = snapshots[snapshots.length - 1];
  await prisma.listing.update({
    where: { mlItemId: itemId },
    data: {
      catalogStatus: lastSnapshot.status,
      catalogSellerPrice: String(lastSnapshot.sellerPrice),
      catalogPriceToWin: String(lastSnapshot.priceToWin),
      catalogPolledAt: lastSnapshot.at,
    },
  });

  const mockPayload = {
    mlItemId: itemId,
    events: sales.map((sale) => ({
      at: sale.at.toISOString(),
      units: sale.units,
    })),
  };

  await mkdir(path.dirname(catalogReportMockSalesPath), { recursive: true });
  await writeFile(
    catalogReportMockSalesPath,
    `${JSON.stringify(mockPayload, null, 2)}\n`,
    "utf8",
  );

  console.log(`Catalog report demo seeded for ${itemId}.`);
  console.log(`  Snapshots: ${snapshots.length} (7 days × 3 status changes)`);
  console.log(`  Mock sales: ${sales.length} events → ${catalogReportMockSalesPath}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Restart npm run dev (mock sales auto-load in development)");
  console.log(`  2. Open /dashboard/catalog-report/${itemId}`);
  console.log("  3. Optional: set CATALOG_MOCK_SALES=0 to disable mock sales");
  console.log("");
  console.log("Sample sale mapping (today):");
  for (const sale of sales.filter(
    (s) => s.at.toDateString() === now.toDateString(),
  )) {
    console.log(
      `  ${sale.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} → ${sale.units} un. (${sale.note})`,
    );
  }
}

main()
  .catch((error) => {
    console.error("Failed to seed catalog report demo:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
