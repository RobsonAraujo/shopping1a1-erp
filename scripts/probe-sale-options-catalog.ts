/**
 * Fase 0 das opções de venda — como o catálogo trata as opções (Clássico,
 * Premium…) do mesmo produto físico. Só leitura: faz apenas GETs no ML e
 * lê o banco (o token pode ser renovado no caminho, como nos outros probes).
 *
 * Para cada produto físico (UP) com 2+ anúncios de catálogo:
 *  - `/items/bulk`: status, preço, tipo, `catalog_product_id`, UP de cada opção;
 *  - `/items/{id}/price_to_win?version=v2`: status de cada opção e quem ganha;
 *  - `/products/{catalog_product_id}/items`: as opções aparecem como ofertas
 *    separadas?
 *  - `/products/{catalog_product_id}`: `buy_box_winner`.
 *
 * Responde: as opções concorrem separadas? Uma opção "perde" para a outra
 * opção do mesmo produto (o que tornaria falso o "Catálogo perdendo")?
 *
 * Uso:
 *   npx tsx scripts/probe-sale-options-catalog.ts            # até 3 produtos do banco
 *   npx tsx scripts/probe-sale-options-catalog.ts --max=6
 *   npx tsx scripts/probe-sale-options-catalog.ts MLBU3422758961 MLBU4047495244
 *
 * Grava o JSON completo em `$TMPDIR/probe-sale-options-catalog.json`.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/lib/db/db";
import { getMercadoLibreConfig } from "../src/lib/mercadolibre/config";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";
import { fromDbSellerId, toDbSellerId } from "../src/lib/mercadolibre/seller-id";

type FetchResult = { status: number; body: unknown };
type Json = Record<string, unknown>;

async function fetchJson(url: string, accessToken: string): Promise<FetchResult> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

function asRecord(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function argNumber(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const n = hit ? Number(hit.slice(name.length + 3)) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const cred = await prisma.mlSellerCredentials.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!cred) {
    console.error("Nenhuma linha em ml_seller_credentials. Faça login no ML primeiro.");
    process.exit(1);
  }
  const mlUserId = fromDbSellerId(cred.mlUserId);
  const seller = await prisma.organizationMlSeller.findUnique({
    where: { mlUserId: toDbSellerId(mlUserId) },
    select: { organizationId: true },
  });
  if (!seller) {
    console.error("Seller sem organização:", mlUserId);
    process.exit(1);
  }
  const accessToken = await resolveSellerAccessToken(mlUserId);
  if (!accessToken) {
    console.error("Não consegui um access token para o seller", mlUserId);
    process.exit(1);
  }
  const { organizationId } = seller;
  const { apiBase } = getMercadoLibreConfig();

  let ups = process.argv.slice(2).filter((a) => a.startsWith("MLBU"));
  if (ups.length === 0) {
    const catalogListings = await prisma.listing.findMany({
      where: { organizationId, catalogListing: true, userProductId: { not: null }, mlStatus: "active" },
      select: { userProductId: true },
    });
    const count = new Map<string, number>();
    for (const row of catalogListings) {
      const up = row.userProductId as string;
      count.set(up, (count.get(up) ?? 0) + 1);
    }
    ups = [...count.entries()]
      .filter(([, n]) => n > 1)
      .map(([up]) => up)
      .slice(0, argNumber("max", 3));
  }
  if (ups.length === 0) {
    console.error("Nenhum produto com 2+ anúncios de catálogo ativos no banco. Passe os UPs.");
    process.exit(1);
  }

  const report: Json = { probedAt: new Date().toISOString(), mlUserId, groups: [] as unknown[] };
  const summary: string[] = [];

  for (const up of ups) {
    const listings = await prisma.listing.findMany({
      where: { organizationId, userProductId: up },
      select: { mlItemId: true },
      orderBy: { createdAt: "asc" },
    });
    const ids = listings.map((l) => l.mlItemId);
    console.log(`\n=== ${up}: ${ids.join(", ")}`);

    const bulk = await fetchJson(`${apiBase}/items/bulk?ids=${ids.join(",")}`, accessToken);
    const items = (Array.isArray(bulk.body) ? bulk.body : [])
      .map((entry) => asRecord(asRecord(entry)?.body))
      .filter((b): b is Json => b !== null);

    const options: Json[] = [];
    const productIds = new Set<string>();
    for (const item of items) {
      const id = String(item.id);
      const ptw = await fetchJson(`${apiBase}/items/${id}/price_to_win?version=v2`, accessToken);
      const ptwBody = asRecord(ptw.body);
      const winner = asRecord(ptwBody?.winner);
      const productId = typeof item.catalog_product_id === "string" ? item.catalog_product_id : null;
      if (productId) productIds.add(productId);
      const option = {
        id,
        listingType: item.listing_type_id,
        status: item.status,
        price: item.price,
        catalogListing: item.catalog_listing,
        catalogProductId: productId,
        userProductId: item.user_product_id,
        availableQuantity: item.available_quantity,
        priceToWin: { http: ptw.status, status: ptwBody?.status, priceToWin: ptwBody?.price_to_win, winnerItemId: winner?.item_id ?? null, winnerPrice: winner?.price ?? null },
      };
      options.push(option);
      const winnerIsSibling = typeof winner?.item_id === "string" && ids.includes(winner.item_id) && winner.item_id !== id;
      console.log(
        `  ${id} ${String(item.listing_type_id)} ${String(item.status)} R$ ${String(item.price)} · price_to_win HTTP ${ptw.status} status=${String(ptwBody?.status)} winner=${String(winner?.item_id ?? "—")}${winnerIsSibling ? " (A OUTRA OPÇÃO)" : ""} preço p/ ganhar=${String(ptwBody?.price_to_win ?? "—")}`,
      );
      summary.push(
        `${up} ${id} ${String(item.listing_type_id)}: ${String(ptwBody?.status)}${winnerIsSibling ? " — perde para a outra opção" : ""}`,
      );
    }

    const products: Json[] = [];
    for (const productId of productIds) {
      const page = await fetchJson(`${apiBase}/products/${productId}/items?offset=0`, accessToken);
      const results = Array.isArray(asRecord(page.body)?.results) ? (asRecord(page.body)!.results as unknown[]) : [];
      const own = results
        .map((r) => asRecord(r))
        .filter((r): r is Json => r !== null && String(r.seller_id) === String(mlUserId))
        .map((r) => ({ itemId: r.item_id, price: r.price, listingType: r.listing_type_id }));
      const product = await fetchJson(`${apiBase}/products/${productId}`, accessToken);
      const buyBox = asRecord(asRecord(product.body)?.buy_box_winner);
      console.log(
        `  /products/${productId}/items HTTP ${page.status}: ${results.length} ofertas, minhas=${JSON.stringify(own)} · buy_box_winner=${String(buyBox?.item_id ?? "—")}`,
      );
      summary.push(`${up} catálogo ${productId}: ${own.length} oferta(s) minha(s) na lista (${own.map((o) => String(o.itemId)).join(", ")}); buy box ${String(buyBox?.item_id ?? "—")}`);
      products.push({ productId, offersHttp: page.status, offers: results.length, ownOffers: own, buyBoxWinner: buyBox });
    }

    (report.groups as unknown[]).push({ up, ids, options, products });
  }

  const outPath = join(tmpdir(), "probe-sale-options-catalog.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nResumo:\n${summary.map((s) => `- ${s}`).join("\n")}`);
  console.log(`\nJSON completo em: ${outPath}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
