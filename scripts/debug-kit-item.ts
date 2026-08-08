/**
 * Debug: dump raw JSON of an item to inspect how the ML API exposes kit composition.
 * Usage: npx tsx scripts/debug-kit-item.ts MLB1234567890
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getMercadoLibreConfig } from "../src/lib/mercadolibre/config";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";

const itemId = process.argv[2];

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  if (!itemId) {
    console.error("Usage: npx tsx scripts/debug-kit-item.ts <mlItemId>");
    process.exit(1);
  }

  const cred = await prisma.mlSellerCredentials.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!cred) {
    console.error("No ml_seller_credentials row found. Log in via ML OAuth first.");
    process.exit(1);
  }

  const accessToken = await resolveSellerAccessToken(cred.mlUserId);
  if (!accessToken) {
    console.error("Could not resolve access token for seller", cred.mlUserId);
    process.exit(1);
  }

  const { apiBase } = getMercadoLibreConfig();

  const itemRes = await fetchJson(`${apiBase}/items/${itemId}`, accessToken);
  console.log("GET /items/" + itemId, "status:", itemRes.status);
  console.log(JSON.stringify(itemRes.body, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
