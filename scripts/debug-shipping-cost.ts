/**
 * Debug shipping cost for a listing (Lucratividade).
 * Usage: npx tsx scripts/debug-shipping-cost.ts MLB5236253058
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getMercadoLibreConfig } from "../src/lib/mercadolibre/config";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";
import { fetchItemSalePrice } from "../src/lib/mercadolibre/item-sale-price";
import { fetchSellerShippingCost } from "../src/lib/mercadolibre/seller-shipping-cost";
import type { ItemBody } from "../src/lib/mercadolibre/types";

const itemId = process.argv[2] ?? "MLB5236253058";

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
  const sellerId = cred.mlUserId;

  console.log("=== Item", itemId, "seller", sellerId, "===\n");

  const itemRes = await fetchJson(`${apiBase}/items/${itemId}`, accessToken);
  console.log("GET /items status:", itemRes.status);
  if (!itemRes.ok) {
    console.log(itemRes.body);
    process.exit(1);
  }

  const item = itemRes.body as ItemBody;
  console.log("shipping:", JSON.stringify(item.shipping, null, 2));
  console.log("price:", item.price, "listing_type_id:", item.listing_type_id);
  console.log("dimensions:", item.dimensions, "shipping.dimensions:", item.shipping?.dimensions);

  const salePrice = await fetchItemSalePrice(accessToken, itemId);
  console.log("\nsale_price (channel_marketplace):", salePrice);

  const shippingWithItemIdOnly = await fetchJson(
    `${apiBase}/users/${sellerId}/shipping_options/free?item_id=${itemId}`,
    accessToken,
  );
  console.log("\n--- shipping_options/free?item_id (sem item_price — bug antigo) ---");
  console.log("status:", shippingWithItemIdOnly.status);
  console.log(JSON.stringify(shippingWithItemIdOnly.body, null, 2));

  const shippingWithItemId = await fetchJson(
    `${apiBase}/users/${sellerId}/shipping_options/free?item_id=${itemId}&item_price=${salePrice.amount}&free_shipping=${item.shipping?.free_shipping ?? false}`,
    accessToken,
  );
  console.log("\n--- shipping_options/free?item_id + item_price (correto) ---");
  console.log("status:", shippingWithItemId.status);
  console.log(JSON.stringify(shippingWithItemId.body, null, 2));

  const listingTypeId = item.listing_type_id ?? "";
  const logisticType = item.shipping?.logistic_type ?? "";
  const dimensions = item.shipping?.dimensions ?? item.dimensions ?? "";
  const fallbackUrl = new URL(`${apiBase}/users/${sellerId}/shipping_options/free`);
  fallbackUrl.searchParams.set("item_price", String(salePrice.amount));
  fallbackUrl.searchParams.set("listing_type_id", listingTypeId);
  if (logisticType) fallbackUrl.searchParams.set("logistic_type", logisticType);
  if (dimensions) fallbackUrl.searchParams.set("dimensions", dimensions);

  const shippingFallback = await fetchJson(fallbackUrl.toString(), accessToken);
  console.log("\n--- shipping_options/free fallback (no item_id) ---");
  console.log("url:", fallbackUrl.toString());
  console.log("status:", shippingFallback.status);
  console.log(JSON.stringify(shippingFallback.body, null, 2));

  const shippingFallbackCatalogPrice = await fetchJson(
    `${apiBase}/users/${sellerId}/shipping_options/free?item_price=${item.price}&listing_type_id=${listingTypeId}${logisticType ? `&logistic_type=${logisticType}` : ""}${dimensions ? `&dimensions=${encodeURIComponent(dimensions)}` : ""}`,
    accessToken,
  );
  console.log("\n--- shipping_options/free fallback with catalog price ---");
  console.log("status:", shippingFallbackCatalogPrice.status);
  console.log(JSON.stringify(shippingFallbackCatalogPrice.body, null, 2));

  const erpShipping = await fetchSellerShippingCost(accessToken, {
    sellerId,
    item,
    effectiveSalePrice: salePrice.amount,
  });
  console.log("\n--- ERP fetchSellerShippingCost ---");
  console.log(erpShipping);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
