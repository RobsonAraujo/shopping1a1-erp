import "dotenv/config";
import { prisma } from "../src/lib/db";

const ITEM_ID = "MLB4561866095";

type Status = "losing" | "shared" | "winning";
type VisitShare = "minimum" | "medium" | "maximum";

function atDayAndTime(base: Date, dayOffset: number, hour: number, minute = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function toMlStatus(
  status: Status,
): "competing" | "sharing_first_place" | "winning" {
  if (status === "losing") return "competing";
  if (status === "shared") return "sharing_first_place";
  return "winning";
}

async function main() {
  // 1) Ensure listing exists and is catalog.
  await prisma.listing.upsert({
    where: { mlItemId: ITEM_ID },
    create: {
      mlItemId: ITEM_ID,
      titleSnapshot: "Mock catálogo - produto teste",
      skuSnapshot: "SKU-MOCK-4561866095",
      imageUrlSnapshot: null,
      catalogListing: true,
      activeOnMl: true,
      lastSyncedAt: new Date(),
    },
    update: {
      titleSnapshot: "Mock catálogo - produto teste",
      skuSnapshot: "SKU-MOCK-4561866095",
      catalogListing: true,
      activeOnMl: true,
      lastSyncedAt: new Date(),
    },
  });

  // 2) Optional reset to rerun seed cleanly for this item.
  await prisma.catalogCompetitionSnapshot.deleteMany({
    where: { mlItemId: ITEM_ID },
  });

  const now = new Date();

  // 3) Create 7 days with 3 transitions per day.
  for (let day = 6; day >= 0; day -= 1) {
    const points: Array<{
      status: Status;
      visitShare: VisitShare;
      at: Date;
      priceToWin: number;
    }> = [
      {
        status: "losing",
        visitShare: "minimum",
        at: atDayAndTime(now, day, 9, 0),
        priceToWin: 95.9,
      },
      {
        status: "shared",
        visitShare: "medium",
        at: atDayAndTime(now, day, 14, 0),
        priceToWin: 97.9,
      },
      {
        status: "winning",
        visitShare: "maximum",
        at: atDayAndTime(now, day, 19, 0),
        priceToWin: 99.9,
      },
    ];

    for (const point of points) {
      const mlStatus = toMlStatus(point.status);

      await prisma.catalogCompetitionSnapshot.create({
        data: {
          mlItemId: ITEM_ID,
          status: point.status,
          source: "manual_poll",
          snapshotAt: point.at,
          priceToWin: point.priceToWin,
          rawResponse: {
            status: mlStatus,
            visit_share: point.visitShare,
            competitors_sharing_first_place:
              point.status === "shared" ? 2 : null,
          },
        },
      });
    }
  }

  console.log(`Mock de 7 dias criado para ${ITEM_ID}.`);
}

main()
  .catch((error) => {
    console.error("Erro ao gerar mock:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
