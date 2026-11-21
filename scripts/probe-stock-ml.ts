/**
 * Fase 0 do estoque automático — conferência (só leitura) do que o ML devolve
 * na conta real, antes de desenhar a baixa automática. Faz apenas GETs no ML e
 * leituras no banco (o token pode ser renovado no caminho, como nos outros
 * probes — `resolveSellerAccessToken`).
 *
 * Responde:
 *  1. Tags do seller (`warehouse_management` = multi-origem).
 *  2. Universo de anúncios: `user_product_id`, `family_id`, logística, tags
 *     (`self_service_in` = Full + Flex no mesmo anúncio), variações.
 *  3. Opções de venda: UPs com mais de um MLB, quais estão cadastrados como
 *     Product, se o `available_quantity` bate entre as opções do mesmo UP;
 *     SKUs iguais em UPs diferentes.
 *  4. `/user-products/{UP}/stock` (locations) numa amostra Full / fora do Full
 *     / convivência / opções de venda, comparado com o `/items` e o Full.
 *  5. Pedidos dos últimos N dias: status, campos das linhas, linhas sem
 *     Product/Kit (e quantas o UP resolveria), `logistic.type` + tags dos
 *     envios, e se o filtro `order.date_last_updated` funciona.
 *  6. Pedidos que a busca perdeu (lacuna de ~2,7%, out/2026): GET /orders/{id}.
 *  7. Linha do tempo das operações do Full (recebimento × transferência) em
 *     alguns anúncios Full.
 *
 * Uso:
 *   npx tsx scripts/probe-stock-ml.ts
 *   npx tsx scripts/probe-stock-ml.ts --days=7 --max-orders=400 --full-items=4
 *   npx tsx scripts/probe-stock-ml.ts --inventory=ABCD12345   # linha do tempo de um Full específico
 *
 * Grava o JSON completo em `$TMPDIR/probe-stock-ml.json` e imprime um resumo.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/lib/db/db";
import { getMercadoLibreConfig } from "../src/lib/mercadolibre/config";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";
import { fromDbSellerId, toDbSellerId } from "../src/lib/mercadolibre/seller-id";
import { mapWithConcurrency } from "../src/lib/mercadolibre/concurrency";

type FetchResult = { status: number; body: unknown };
type Json = Record<string, unknown>;

/** Pedidos que o `/orders/search` não devolveu em out/2026 (memória da lacuna). */
const KNOWN_MISSING_ORDER_IDS = [
  "2000019188749716",
  "2000019182154708",
  "2000019175093224",
  "2000019163141518",
  "2000019156934182",
];

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function argNumber(name: string, fallback: number): number {
  const raw = argValue(name);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asRecord(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

function normalizeSku(sku: string | null): string | null {
  return sku ? sku.trim().toUpperCase() : null;
}

async function fetchJson(
  url: string,
  accessToken: string,
  extraHeaders?: Record<string, string>,
): Promise<FetchResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text };
    }
  }
  return { status: 0, body: "falhou após 3 tentativas" };
}

function itemSku(item: Json): string | null {
  const direct = str(item.seller_custom_field);
  if (direct) return direct;
  for (const raw of asArray(item.attributes)) {
    const attr = asRecord(raw);
    if (attr?.id === "SELLER_SKU") return str(attr.value_name);
  }
  return null;
}

type ItemSummary = {
  id: string;
  status: string | null;
  title: string | null;
  listingTypeId: string | null;
  catalogListing: boolean | null;
  logisticType: string | null;
  tags: string[];
  userProductId: string | null;
  familyId: string | null;
  inventoryId: string | null;
  availableQuantity: number | null;
  variations: Array<{
    id: string | null;
    userProductId: string | null;
    inventoryId: string | null;
    availableQuantity: number | null;
    sku: string | null;
  }>;
  sku: string | null;
  isProduct: boolean;
  isKit: boolean;
  warehouseQty: number | null;
  itemRelations: unknown;
};

function summarizeItem(
  item: Json,
  productIds: Set<string>,
  kitIds: Set<string>,
  warehouseByItem: Map<string, number>,
): ItemSummary {
  const id = String(item.id);
  const shipping = asRecord(item.shipping);
  return {
    id,
    status: str(item.status),
    title: str(item.title),
    listingTypeId: str(item.listing_type_id),
    catalogListing: typeof item.catalog_listing === "boolean" ? item.catalog_listing : null,
    logisticType: str(shipping?.logistic_type),
    tags: asArray(item.tags).map(String),
    userProductId: str(item.user_product_id),
    familyId: str(item.family_id),
    inventoryId: str(item.inventory_id),
    availableQuantity: num(item.available_quantity),
    variations: asArray(item.variations).map((raw) => {
      const v = asRecord(raw) ?? {};
      let sku = str(v.seller_custom_field);
      if (!sku) {
        for (const a of asArray(v.attributes)) {
          const attr = asRecord(a);
          if (attr?.id === "SELLER_SKU") sku = str(attr.value_name);
        }
      }
      return {
        id: str(v.id),
        userProductId: str(v.user_product_id),
        inventoryId: str(v.inventory_id),
        availableQuantity: num(v.available_quantity),
        sku,
      };
    }),
    sku: itemSku(item),
    isProduct: productIds.has(id),
    isKit: kitIds.has(id),
    warehouseQty: warehouseByItem.get(id) ?? null,
    itemRelations: item.item_relations ?? null,
  };
}

async function fetchItemsRaw(accessToken: string, ids: string[]): Promise<Json[]> {
  const { apiBase } = getMercadoLibreConfig();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const pages = await mapWithConcurrency(chunks, 6, async (chunk) => {
    const res = await fetchJson(`${apiBase}/items/bulk?ids=${chunk.join(",")}`, accessToken);
    const out: Json[] = [];
    for (const raw of asArray(res.body)) {
      const entry = asRecord(raw);
      const body = asRecord(entry?.body);
      if (body && body.id) out.push(body);
    }
    return out;
  });
  return pages.flat();
}

async function fetchAllSellerItemIds(
  accessToken: string,
  sellerId: number,
  status: string,
): Promise<string[]> {
  const { apiBase } = getMercadoLibreConfig();
  const ids: string[] = [];
  for (let offset = 0; offset < 5000; offset += 50) {
    const res = await fetchJson(
      `${apiBase}/users/${sellerId}/items/search?status=${status}&offset=${offset}&limit=50`,
      accessToken,
    );
    const body = asRecord(res.body);
    const results = asArray(body?.results).map(String);
    ids.push(...results);
    const total = num(asRecord(body?.paging)?.total) ?? 0;
    if (res.status !== 200 || results.length === 0 || offset + 50 >= total) break;
  }
  return ids;
}

function sectionTitle(title: string) {
  console.log(`\n==================== ${title}`);
}

async function main() {
  const days = argNumber("days", 7);
  const maxOrders = argNumber("max-orders", 400);
  const fullItemsToProbe = argNumber("full-items", 4);
  const forcedInventory = argValue("inventory");

  const cred = await prisma.mlSellerCredentials.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!cred) {
    console.error("Nenhuma linha em ml_seller_credentials. Faça login no ML primeiro.");
    process.exit(1);
  }
  const sellerId = fromDbSellerId(cred.mlUserId);
  const seller = await prisma.organizationMlSeller.findUnique({
    where: { mlUserId: toDbSellerId(sellerId) },
    select: { organizationId: true },
  });
  if (!seller) {
    console.error("Seller sem organização:", sellerId);
    process.exit(1);
  }
  const organizationId = seller.organizationId;
  const accessToken = await resolveSellerAccessToken(sellerId);
  if (!accessToken) {
    console.error("Não consegui um access token para o seller", sellerId);
    process.exit(1);
  }
  const { apiBase } = getMercadoLibreConfig();
  const report: Json = { probedAt: new Date().toISOString(), sellerId, days, maxOrders };

  // ─── 1. Seller ──────────────────────────────────────────────────────────
  sectionTitle("1. Seller");
  const me = await fetchJson(`${apiBase}/users/me`, accessToken);
  const meBody = asRecord(me.body) ?? {};
  const sellerTags = asArray(meBody.tags).map(String);
  console.log(`HTTP ${me.status} site=${String(meBody.site_id)} tags=${JSON.stringify(sellerTags)}`);
  console.log(
    `multi-origem (warehouse_management): ${sellerTags.includes("warehouse_management") ? "SIM" : "não"}` +
      ` · user_product_seller: ${sellerTags.includes("user_product_seller") ? "SIM" : "não"}`,
  );
  report.seller = { status: me.status, tags: sellerTags, siteId: meBody.site_id ?? null };

  // ─── 2. Universo de anúncios ───────────────────────────────────────────
  sectionTitle("2. Anúncios");
  const [products, kits, warehouse] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId },
      select: { mlItemId: true, sku: true, active: true },
    }),
    prisma.kit.findMany({ where: { organizationId }, select: { mlItemId: true } }),
    prisma.warehouseStock.findMany({
      where: { organizationId },
      select: { mlItemId: true, quantity: true },
    }),
  ]);
  const productIds = new Set(products.map((p) => p.mlItemId));
  const kitIds = new Set(kits.map((k) => k.mlItemId));
  const warehouseByItem = new Map(warehouse.map((w) => [w.mlItemId, w.quantity]));

  const [activeIds, pausedIds] = await Promise.all([
    fetchAllSellerItemIds(accessToken, sellerId, "active"),
    fetchAllSellerItemIds(accessToken, sellerId, "paused"),
  ]);
  const universe = [
    ...new Set([...activeIds, ...pausedIds, ...productIds, ...kitIds]),
  ];
  const rawItems = await fetchItemsRaw(accessToken, universe);
  const items = rawItems.map((it) => summarizeItem(it, productIds, kitIds, warehouseByItem));
  const itemById = new Map(items.map((it) => [it.id, it]));

  const withUp = items.filter((it) => it.userProductId);
  const fullItems = items.filter((it) => it.logisticType === "fulfillment");
  const coexist = fullItems.filter((it) => it.tags.includes("self_service_in"));
  const withVariations = items.filter((it) => it.variations.length > 0);
  const variationUpCount = withVariations.filter((it) =>
    it.variations.some((v) => v.userProductId),
  ).length;
  console.log(
    `ML ativos=${activeIds.length} pausados=${pausedIds.length} · Products no ERP=${products.length} · Kits=${kits.length} · lidos=${items.length}`,
  );
  console.log(
    `com user_product_id=${withUp.length}/${items.length} · com family_id=${items.filter((it) => it.familyId).length}`,
  );
  console.log(
    `logística: ${JSON.stringify(countBy(items, (it) => it.logisticType ?? "—"))}`,
  );
  console.log(
    `Full=${fullItems.length} · Full + Flex no mesmo anúncio (self_service_in)=${coexist.length} · com variações=${withVariations.length} (com UP na variação: ${variationUpCount})`,
  );
  console.log(`tipos de anúncio: ${JSON.stringify(countBy(items, (it) => it.listingTypeId ?? "—"))}`);
  const tagCounts: Record<string, number> = {};
  for (const it of items) for (const t of it.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  console.log(
    `tags mais comuns: ${JSON.stringify(Object.fromEntries(Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 25)))}`,
  );
  const productsNotOnMl = products.filter((p) => !itemById.has(p.mlItemId)).length;
  console.log(`Products sem anúncio legível no ML: ${productsNotOnMl}`);
  report.items = items;

  // ─── 3. Opções de venda ────────────────────────────────────────────────
  sectionTitle("3. Opções de venda (vários MLB no mesmo UP)");
  const byUp = new Map<string, ItemSummary[]>();
  for (const it of withUp) {
    const list = byUp.get(it.userProductId!) ?? [];
    list.push(it);
    byUp.set(it.userProductId!, list);
  }
  const multiUps = [...byUp.entries()].filter(([, list]) => list.length > 1);
  console.log(`UPs distintos=${byUp.size} · UPs com mais de 1 MLB=${multiUps.length}`);
  const multiUpReport: unknown[] = [];
  for (const [up, list] of multiUps) {
    const activeQty = list
      .filter((it) => it.status === "active")
      .map((it) => it.availableQuantity);
    const sameQty = activeQty.length > 1 && activeQty.every((q) => q === activeQty[0]);
    const registered = list.filter((it) => it.isProduct).length;
    const withWarehouse = list.filter((it) => (it.warehouseQty ?? 0) > 0).length;
    console.log(
      `  ${up} · ${list.length} MLB · cadastrados=${registered} · galpão preenchido em ${withWarehouse} · qtd igual entre ativos: ${activeQty.length > 1 ? (sameQty ? "sim" : "NÃO") : "—"}`,
    );
    for (const it of list) {
      console.log(
        `     ${it.id} ${it.listingTypeId ?? "—"} ${it.status ?? "—"} log=${it.logisticType ?? "—"} qtd=${it.availableQuantity ?? "—"} sku=${it.sku ?? "—"} product=${it.isProduct ? "sim" : "não"} galpão=${it.warehouseQty ?? "—"} catálogo=${String(it.catalogListing)}`,
      );
    }
    multiUpReport.push({ up, items: list.map((it) => it.id), sameQty, registered });
  }
  const bySku = new Map<string, Set<string>>();
  for (const it of withUp) {
    const sku = normalizeSku(it.sku);
    if (!sku) continue;
    const set = bySku.get(sku) ?? new Set<string>();
    set.add(it.userProductId!);
    bySku.set(sku, set);
  }
  const skuAcrossUps = [...bySku.entries()].filter(([, ups]) => ups.size > 1);
  console.log(`SKUs iguais em UPs diferentes (anúncios antigos separados?): ${skuAcrossUps.length}`);
  for (const [sku, ups] of skuAcrossUps.slice(0, 15)) {
    const ids = withUp.filter((it) => normalizeSku(it.sku) === sku);
    console.log(
      `  ${sku}: ${[...ups].join(", ")} → ${ids.map((it) => `${it.id}(${it.listingTypeId ?? "—"},${it.logisticType ?? "—"},qtd=${it.availableQuantity ?? "—"},product=${it.isProduct ? "s" : "n"})`).join(" ")}`,
    );
  }
  report.saleOptions = {
    distinctUps: byUp.size,
    multiItemUps: multiUpReport,
    skuAcrossUps: skuAcrossUps.map(([sku, ups]) => ({ sku, ups: [...ups] })),
  };

  // ─── 4. /user-products/{UP}/stock ──────────────────────────────────────
  sectionTitle("4. /user-products/{UP}/stock (amostra)");
  const sampleUps = new Map<string, string>();
  const addSample = (list: ItemSummary[], label: string, n: number) => {
    for (const it of list.filter((x) => x.userProductId && x.status === "active").slice(0, n)) {
      if (!sampleUps.has(it.userProductId!)) sampleUps.set(it.userProductId!, `${label} ${it.id}`);
    }
  };
  addSample(coexist, "Full+Flex", 3);
  addSample(fullItems.filter((it) => !it.tags.includes("self_service_in")), "Full", 3);
  addSample(items.filter((it) => it.logisticType !== "fulfillment"), "fora do Full", 3);
  for (const [up, list] of multiUps.slice(0, 3)) sampleUps.set(up, `opções ${list.map((i) => i.id).join("/")}`);

  const upStockReport: unknown[] = [];
  for (const [up, label] of sampleUps) {
    const stock = await fetchJson(`${apiBase}/user-products/${up}/stock`, accessToken);
    const upBody = await fetchJson(`${apiBase}/user-products/${up}`, accessToken);
    const stockBody = asRecord(stock.body);
    const locations = asArray(stockBody?.locations).map((raw) => {
      const loc = asRecord(raw) ?? {};
      return { type: str(loc.type), quantity: num(loc.quantity), raw: loc };
    });
    const related = withUp.filter((it) => it.userProductId === up);
    console.log(
      `  ${up} [${label}] HTTP ${stock.status} locations=${JSON.stringify(locations.map((l) => `${l.type}:${l.quantity}`))} · /items qtd=${JSON.stringify(related.map((it) => `${it.id}:${it.availableQuantity}`))} · family=${String(asRecord(upBody.body)?.family_id ?? "—")}`,
    );
    if (stock.status !== 200) console.log(`     corpo: ${JSON.stringify(stock.body).slice(0, 300)}`);
    upStockReport.push({ up, label, stock, userProduct: upBody });
  }
  report.userProductStock = upStockReport;

  // Full: endpoint de fulfillment para os Full da amostra (compara com locations).
  const fullStockReport: unknown[] = [];
  for (const it of [...coexist, ...fullItems].slice(0, 4)) {
    const inv = it.inventoryId ?? it.variations.find((v) => v.inventoryId)?.inventoryId;
    if (!inv) continue;
    const res = await fetchJson(`${apiBase}/inventories/${inv}/stock/fulfillment`, accessToken);
    const b = asRecord(res.body);
    console.log(
      `  Full ${it.id} inv=${inv} HTTP ${res.status} available=${String(b?.available_quantity)} not_available=${String(b?.not_available_quantity)} detail=${JSON.stringify(b?.not_available_detail ?? null)} total=${String(b?.total)}`,
    );
    fullStockReport.push({ itemId: it.id, inventoryId: inv, response: res });
  }
  report.fulfillmentStock = fullStockReport;

  // ─── 5. Pedidos dos últimos N dias ─────────────────────────────────────
  sectionTitle(`5. Pedidos (últimos ${days} dias, até ${maxOrders})`);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const orders: Json[] = [];
  let ordersTotal: number | null = null;
  for (let offset = 0; offset < maxOrders; offset += 50) {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    u.searchParams.set("order.date_created.from", from.toISOString());
    u.searchParams.set("order.date_created.to", to.toISOString());
    u.searchParams.set("sort", "date_desc");
    u.searchParams.set("limit", "50");
    u.searchParams.set("offset", String(offset));
    const res = await fetchJson(u.toString(), accessToken);
    const body = asRecord(res.body);
    ordersTotal = num(asRecord(body?.paging)?.total) ?? ordersTotal;
    const results = asArray(body?.results).map((r) => asRecord(r) ?? {});
    orders.push(...results);
    if (res.status !== 200 || results.length < 50) break;
  }
  console.log(`pedidos lidos=${orders.length} (total no período=${String(ordersTotal)})`);
  console.log(`status: ${JSON.stringify(countBy(orders, (o) => str(o.status) ?? "—"))}`);
  console.log(
    `tags de pedido: ${JSON.stringify(countBy(orders.flatMap((o) => asArray(o.tags).map(String)), (t) => t))}`,
  );
  const withPack = orders.filter((o) => o.pack_id).length;
  console.log(`com pack_id (carrinho)=${withPack} · com fulfilled=${JSON.stringify(countBy(orders, (o) => String(o.fulfilled)))}`);
  const firstLine = asRecord(asArray(orders[0]?.order_items)[0]);
  console.log(`campos de uma linha de pedido: ${JSON.stringify(Object.keys(firstLine ?? {}))}`);
  console.log(`campos de line.item: ${JSON.stringify(Object.keys(asRecord(firstLine?.item) ?? {}))}`);
  console.log(`exemplo de linha: ${JSON.stringify(firstLine).slice(0, 700)}`);
  console.log(`campos do pedido: ${JSON.stringify(Object.keys(orders[0] ?? {}))}`);

  // Mapeamento das linhas → Product / Kit / UP.
  type LineRow = { orderId: string; itemId: string; qty: number; variationId: string | null; lineUp: string | null };
  const lines: LineRow[] = [];
  for (const o of orders) {
    for (const raw of asArray(o.order_items)) {
      const line = asRecord(raw) ?? {};
      const item = asRecord(line.item) ?? {};
      const itemId = str(item.id) ?? str(line.item_id);
      if (!itemId) continue;
      lines.push({
        orderId: String(o.id),
        itemId,
        qty: num(line.quantity) ?? 0,
        variationId: str(item.variation_id),
        lineUp: str(item.user_product_id) ?? str(line.user_product_id),
      });
    }
  }
  const unknownItemIds = [
    ...new Set(lines.map((l) => l.itemId).filter((id) => !itemById.has(id))),
  ];
  if (unknownItemIds.length > 0) {
    const extra = await fetchItemsRaw(accessToken, unknownItemIds);
    for (const it of extra) {
      const s = summarizeItem(it, productIds, kitIds, warehouseByItem);
      itemById.set(s.id, s);
    }
  }
  const upToProduct = new Map<string, string>();
  for (const it of itemById.values()) {
    if (it.userProductId && it.isProduct && !upToProduct.has(it.userProductId)) {
      upToProduct.set(it.userProductId, it.id);
    }
  }
  const classify = (l: LineRow): string => {
    if (productIds.has(l.itemId)) return "Product direto";
    if (kitIds.has(l.itemId)) return "Kit direto";
    const up = l.lineUp ?? itemById.get(l.itemId)?.userProductId ?? null;
    if (up && upToProduct.has(up)) return "resolvido pelo UP";
    return "sem produto";
  };
  const lineClass = countBy(lines, classify);
  console.log(`linhas=${lines.length} · mapeamento: ${JSON.stringify(lineClass)}`);
  console.log(
    `linhas com user_product_id no próprio pedido: ${lines.filter((l) => l.lineUp).length}/${lines.length} · com variation_id: ${lines.filter((l) => l.variationId).length}`,
  );
  const unresolved = lines.filter((l) => classify(l) === "sem produto");
  for (const l of unresolved.slice(0, 10)) {
    const it = itemById.get(l.itemId);
    console.log(
      `  sem produto: pedido ${l.orderId} ${l.itemId} ${it?.listingTypeId ?? "—"} UP=${it?.userProductId ?? "—"} sku=${it?.sku ?? "—"} kit-tag=${it?.tags.includes("bundle") ? "sim" : "não"}`,
    );
  }
  const viaUp = lines.filter((l) => classify(l) === "resolvido pelo UP");
  for (const l of viaUp.slice(0, 10)) {
    const it = itemById.get(l.itemId);
    console.log(
      `  pelo UP: ${l.itemId} (${it?.listingTypeId ?? "—"}) → Product ${upToProduct.get(l.lineUp ?? it?.userProductId ?? "")}`,
    );
  }

  // Envios: logistic.type + tags + status.
  const shipmentIds = [
    ...new Set(
      orders
        .map((o) => str(asRecord(o.shipping)?.id))
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const shipments = await mapWithConcurrency(shipmentIds, 8, async (id) => {
    const res = await fetchJson(`${apiBase}/shipments/${id}`, accessToken, { "x-format-new": "true" });
    const b = asRecord(res.body) ?? {};
    const logistic = asRecord(b.logistic);
    return {
      id,
      http: res.status,
      type: str(logistic?.type) ?? str(b.logistic_type),
      mode: str(logistic?.mode) ?? str(b.mode),
      status: str(b.status),
      substatus: str(b.substatus),
      tags: asArray(b.tags).map(String),
      originNode: asRecord(asRecord(b.origin)?.node) ?? null,
    };
  });
  console.log(`envios lidos=${shipments.length} (pedidos sem envio=${orders.length - orders.filter((o) => str(asRecord(o.shipping)?.id)).length})`);
  console.log(`logistic.type: ${JSON.stringify(countBy(shipments, (s) => `${s.type ?? "—"}/${s.mode ?? "—"}`))}`);
  console.log(`status do envio: ${JSON.stringify(countBy(shipments, (s) => s.status ?? "—"))}`);
  console.log(
    `tags de envio: ${JSON.stringify(countBy(shipments.flatMap((s) => s.tags), (t) => t))}`,
  );
  console.log(
    `exemplos origin.node: ${JSON.stringify(shipments.filter((s) => s.originNode).slice(0, 3).map((s) => ({ type: s.type, node: s.originNode })))}`,
  );

  // Filtro incremental: date_last_updated.
  const lastUpdatedTests: unknown[] = [];
  for (const name of ["order.date_last_updated", "order.last_updated"]) {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    u.searchParams.set(`${name}.from`, new Date(to.getTime() - 3 * 3_600_000).toISOString());
    u.searchParams.set(`${name}.to`, to.toISOString());
    u.searchParams.set("sort", "date_desc");
    u.searchParams.set("limit", "50");
    const res = await fetchJson(u.toString(), accessToken);
    const body = asRecord(res.body);
    const results = asArray(body?.results).map((r) => asRecord(r) ?? {});
    const sample = results.slice(0, 5).map((r) => ({
      id: r.id,
      status: r.status,
      date_created: r.date_created,
      last_updated: r.last_updated ?? r.date_last_updated ?? null,
    }));
    console.log(
      `filtro ${name}: HTTP ${res.status} total=${String(asRecord(body?.paging)?.total)} amostra=${JSON.stringify(sample)}`,
    );
    if (res.status !== 200) console.log(`   corpo: ${JSON.stringify(res.body).slice(0, 300)}`);
    lastUpdatedTests.push({ name, status: res.status, paging: body?.paging ?? null, sample });
  }
  report.orders = {
    read: orders.length,
    total: ordersTotal,
    lineClass,
    shipments,
    lastUpdatedTests,
    sampleOrder: orders[0] ?? null,
  };

  // ─── 6. Pedidos que a busca perdeu ─────────────────────────────────────
  sectionTitle("6. Pedidos que a busca perdeu (out/2026)");
  const missing: unknown[] = [];
  for (const id of KNOWN_MISSING_ORDER_IDS) {
    const res = await fetchJson(`${apiBase}/orders/${id}`, accessToken);
    const b = asRecord(res.body) ?? {};
    const linesInfo = asArray(b.order_items).map((raw) => {
      const line = asRecord(raw) ?? {};
      return `${String(asRecord(line.item)?.id)}×${String(line.quantity)}`;
    });
    console.log(
      `  ${id} HTTP ${res.status} status=${String(b.status)} created=${String(b.date_created)} closed=${String(b.date_closed)} pack=${String(b.pack_id ?? "—")} tags=${JSON.stringify(b.tags ?? null)} seller=${String(asRecord(b.seller)?.id)} itens=${JSON.stringify(linesInfo)} context=${JSON.stringify(b.context ?? null)}`,
    );
    missing.push({ id, response: res });
  }
  report.knownMissingOrders = missing;

  // ─── 7. Linha do tempo das operações do Full ───────────────────────────
  sectionTitle("7. Operações do Full (recebimento × transferência)");
  const inventoryTargets: Array<{ itemId: string; inventoryId: string }> = [];
  if (forcedInventory) inventoryTargets.push({ itemId: "(argumento)", inventoryId: forcedInventory });
  for (const it of fullItems.filter((x) => x.status === "active")) {
    if (inventoryTargets.length >= fullItemsToProbe + (forcedInventory ? 1 : 0)) break;
    const inv = it.inventoryId ?? it.variations.find((v) => v.inventoryId)?.inventoryId;
    if (inv && !inventoryTargets.some((t) => t.inventoryId === inv)) {
      inventoryTargets.push({ itemId: it.id, inventoryId: inv });
    }
  }
  const opsFrom = new Date(to.getTime() - 55 * 86_400_000).toISOString().slice(0, 10);
  const opsTo = to.toISOString().slice(0, 10);
  const opsReport: unknown[] = [];
  const allOpTypes: Record<string, number> = {};
  for (const target of inventoryTargets) {
    const ops: Json[] = [];
    let scroll: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const u = new URL(`${apiBase}/stock/fulfillment/operations/search`);
      u.searchParams.set("seller_id", String(sellerId));
      u.searchParams.set("inventory_id", target.inventoryId);
      u.searchParams.set("date_from", opsFrom);
      u.searchParams.set("date_to", opsTo);
      u.searchParams.set("limit", "1000");
      if (scroll) u.searchParams.set("scroll", scroll);
      const res = await fetchJson(u.toString(), accessToken);
      const body = asRecord(res.body);
      if (res.status !== 200) {
        console.log(`  ${target.inventoryId} HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
        break;
      }
      ops.push(...asArray(body?.results).map((r) => asRecord(r) ?? {}));
      scroll = str(asRecord(body?.paging)?.scroll);
      if (!scroll) break;
    }
    ops.sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
    for (const op of ops) {
      const t = str(op.type) ?? "—";
      allOpTypes[t] = (allOpTypes[t] ?? 0) + 1;
    }
    const nowStock = await fetchJson(
      `${apiBase}/inventories/${target.inventoryId}/stock/fulfillment`,
      accessToken,
    );
    const ns = asRecord(nowStock.body);
    console.log(
      `\n  ${target.itemId} inv=${target.inventoryId} · ${ops.length} operações em ${opsFrom}..${opsTo} · agora: available=${String(ns?.available_quantity)} detail=${JSON.stringify(ns?.not_available_detail ?? null)}`,
    );
    const nonSale = ops.filter((op) => !String(op.type).startsWith("SALE_"));
    for (const op of nonSale.slice(-25)) {
      console.log(
        `    ${String(op.date_created)} ${String(op.type)} detail=${JSON.stringify(op.detail ?? null)} refs=${JSON.stringify(op.external_references ?? null)}`,
      );
    }
    const saleCount = ops.length - nonSale.length;
    if (saleCount > 0) console.log(`    (+ ${saleCount} operações SALE_* omitidas)`);
    opsReport.push({ ...target, operations: ops, stockNow: nowStock });
  }
  console.log(`\n  tipos de operação vistos: ${JSON.stringify(allOpTypes)}`);
  report.fulfillmentOperations = { types: allOpTypes, targets: opsReport };

  const outPath = join(tmpdir(), "probe-stock-ml.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON completo em: ${outPath}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
