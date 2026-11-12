/**
 * Validação (só leitura) do que o ML devolve para a regra "Subir preço no
 * catálogo" da Central de anúncios. Faz apenas GETs:
 *  - /items/{id}/price_to_win sem e com `version=v2`
 *  - /products/{catalog_product_id}/items (todas as páginas, até 100 ofertas)
 *  - /products/{catalog_product_id} (só `buy_box_winner`)
 *
 * Uso:
 *   npx tsx scripts/probe-catalog-competitors.ts                 # 3 catálogos ganhando do banco
 *   npx tsx scripts/probe-catalog-competitors.ts MLB123 MLB456   # anúncios específicos
 *
 * Grava o JSON completo em `$TMPDIR/probe-catalog-competitors.json` e imprime
 * um resumo. O token pode ser renovado no caminho (resolveSellerAccessToken).
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

async function main() {
  const cred = await prisma.mlSellerCredentials.findFirst({
    orderBy: { updatedAt: "desc" },
  });
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

  let itemIds = process.argv.slice(2).filter(Boolean);
  if (itemIds.length === 0) {
    const rows = await prisma.listing.findMany({
      where: {
        organizationId: seller.organizationId,
        catalogListing: true,
        activeOnMl: true,
        catalogStatus: "winning",
      },
      orderBy: { catalogPolledAt: "desc" },
      select: { mlItemId: true },
      take: 3,
    });
    itemIds = rows.map((row) => row.mlItemId);
  }
  if (itemIds.length === 0) {
    console.error("Nenhum catálogo ganhando no banco. Passe os MLB na linha de comando.");
    process.exit(1);
  }

  const { apiBase } = getMercadoLibreConfig();
  const report: Record<string, unknown> = {
    probedAt: new Date().toISOString(),
    mlUserId,
    items: [] as unknown[],
  };

  for (const itemId of itemIds) {
    console.log(`\n=== ${itemId}`);
    const v1 = await fetchJson(`${apiBase}/items/${itemId}/price_to_win`, accessToken);
    const v2 = await fetchJson(
      `${apiBase}/items/${itemId}/price_to_win?version=v2`,
      accessToken,
    );
    const bulk = await fetchJson(`${apiBase}/items/bulk?ids=${itemId}`, accessToken);

    const v1Body = asRecord(v1.body);
    const v2Body = asRecord(v2.body);
    const bulkEntry = Array.isArray(bulk.body) ? asRecord(bulk.body[0]) : null;
    const itemBody = asRecord(bulkEntry?.body);
    const productId =
      (typeof v2Body?.catalog_product_id === "string" && v2Body.catalog_product_id) ||
      (typeof v1Body?.catalog_product_id === "string" && v1Body.catalog_product_id) ||
      (typeof itemBody?.catalog_product_id === "string" && itemBody.catalog_product_id) ||
      null;

    console.log(
      `price_to_win v1 HTTP ${v1.status} status=${String(v1Body?.status)} · v2 HTTP ${v2.status} status=${String(v2Body?.status)}`,
    );
    console.log(`catalog_product_id=${productId ?? "—"}`);

    const pages: FetchResult[] = [];
    let product: FetchResult | null = null;
    if (productId) {
      for (let offset = 0; offset < 100; ) {
        const page = await fetchJson(
          `${apiBase}/products/${productId}/items?offset=${offset}`,
          accessToken,
        );
        pages.push(page);
        const body = asRecord(page.body);
        const results = Array.isArray(body?.results) ? body.results : [];
        const paging = asRecord(body?.paging);
        const total = typeof paging?.total === "number" ? paging.total : results.length;
        const limit =
          typeof paging?.limit === "number" && paging.limit > 0 ? paging.limit : results.length;
        console.log(
          `/products/${productId}/items offset=${offset} HTTP ${page.status} results=${results.length} paging=${JSON.stringify(paging)}`,
        );
        if (page.status !== 200 || results.length === 0 || limit === 0) break;
        offset += limit;
        if (offset >= total) break;
      }
      product = await fetchJson(`${apiBase}/products/${productId}`, accessToken);
      const winner = asRecord(product.body)?.buy_box_winner ?? null;
      console.log(`/products/${productId} HTTP ${product.status} buy_box_winner=${JSON.stringify(winner)}`);

      for (const page of pages) {
        const results = asRecord(page.body)?.results;
        if (!Array.isArray(results)) continue;
        for (const raw of results) {
          const r = asRecord(raw);
          if (!r) continue;
          const shipping = asRecord(r.shipping);
          console.log(
            `  ${String(r.item_id)} seller=${String(r.seller_id)}${
              String(r.seller_id) === String(mlUserId) ? " (EU)" : ""
            } price=${String(r.price)} original=${String(r.original_price)} logistic=${String(
              shipping?.logistic_type,
            )} free=${String(shipping?.free_shipping)} deals=${JSON.stringify(r.deal_ids ?? null)}`,
          );
        }
      }
    }

    (report.items as unknown[]).push({
      itemId,
      catalogProductId: productId,
      priceToWinV1: v1,
      priceToWinV2: v2,
      item: itemBody,
      productItemsPages: pages,
      productBuyBoxWinner: product
        ? { status: product.status, buy_box_winner: asRecord(product.body)?.buy_box_winner ?? null }
        : null,
    });
  }

  const outPath = join(tmpdir(), "probe-catalog-competitors.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON completo em: ${outPath}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
