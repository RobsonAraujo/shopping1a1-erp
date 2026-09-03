/**
 * Lista linhas de coleta Full (CFCBI / INBOUND_COLLECT) do faturamento ML.
 *
 * Usage:
 *   npx tsx scripts/debug-full-collect-charges.ts 2026 6
 *   npx tsx scripts/debug-full-collect-charges.ts 2026 6 123456789
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/db";
import { fetchFullCollectChargesForPeriod } from "../src/lib/mercadolibre/billing-full-collect";
import { billingPeriodKey } from "../src/lib/mercadolibre/billing-shared";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";

async function resolveMlUserId(explicit?: string): Promise<number> {
  if (explicit) {
    const n = Number(explicit);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Invalid seller id: ${explicit}`);
    }
    return n;
  }

  const fromEnv = process.env.CRON_ML_USER_ID?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const row = await prisma.mlSellerCredentials.findFirst({
    select: { mlUserId: true },
  });
  if (!row) {
    throw new Error("No ml_seller_credentials row found.");
  }
  return row.mlUserId;
}

async function main() {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const month = Number(process.argv[3] ?? new Date().getMonth() + 1);
  const sellerArg = process.argv[4];

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(
      "Usage: npx tsx scripts/debug-full-collect-charges.ts <year> <month> [mlUserId]",
    );
  }

  const mlUserId = await resolveMlUserId(sellerArg);
  const token = await resolveSellerAccessToken(mlUserId);
  if (!token) {
    throw new Error(`Could not resolve access token for seller ${mlUserId}`);
  }

  const key = billingPeriodKey(year, month);
  console.log(`\n=== Full collect charges key=${key} seller=${mlUserId} ===\n`);

  const { charges, probe } = await fetchFullCollectChargesForPeriod(
    token,
    year,
    month,
  );
  console.log("probe:", probe);
  console.log(`Merged full collect rows: ${charges.length}\n`);

  for (const charge of charges) {
    console.log(JSON.stringify(charge, null, 2));
    console.log("---");
  }

  if (charges.length === 0) {
    console.log("No full collect rows found in full/details, ML/details or summary.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
