import { getMercadoLibreConfig } from "./config";
import type {
  ItemBody,
  ItemMultigetEntry,
  ItemsSearchResponse,
  OrderSearchResponse,
  UserMe,
} from "./types";

export async function fetchMe(accessToken: string): Promise<UserMe> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(`${apiBase}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`users/me failed: ${res.status}`);
  }
  return res.json() as Promise<UserMe>;
}

export async function fetchUserItemsSearch(
  accessToken: string,
  userId: number,
  offset: number,
  limit: number,
  options?: { status?: string },
): Promise<ItemsSearchResponse> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/users/${userId}/items/search`);
  u.searchParams.set("offset", String(offset));
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("status", options?.status ?? "active");

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`items/search failed: ${res.status} ${t}`);
  }
  return res.json() as Promise<ItemsSearchResponse>;
}

function normalizeMultigetEntry(entry: ItemMultigetEntry): ItemBody | null {
  if (entry && typeof entry === "object" && "body" in entry && entry.body) {
    return entry.body as ItemBody;
  }
  if (entry && typeof entry === "object" && "id" in entry) {
    return entry as ItemBody;
  }
  return null;
}

export async function fetchItemsByIds(
  accessToken: string,
  ids: string[],
): Promise<ItemBody[]> {
  if (ids.length === 0) return [];
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/items`);
  u.searchParams.set("ids", ids.join(","));

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`items multiget failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as ItemMultigetEntry[] | ItemBody[];
  if (!Array.isArray(data)) return [];

  return data
    .map((entry) => normalizeMultigetEntry(entry as ItemMultigetEntry))
    .filter((x): x is ItemBody => x !== null);
}

export async function fetchItemById(
  accessToken: string,
  id: string,
): Promise<ItemBody | null> {
  const items = await fetchItemsByIds(accessToken, [id]);
  return items[0] ?? null;
}

/**
 * Soma unidades vendidas por item (MLA123…) em pedidos pagos no intervalo
 * [now - windowDays, now], usando order.date_created. Pagina até cobrir todos os pedidos.
 */
export async function fetchUnitsSoldByItemInWindow(
  accessToken: string,
  sellerId: number,
  windowDays: number,
): Promise<Record<string, number>> {
  if (windowDays <= 0) return {};

  const { apiBase } = getMercadoLibreConfig();
  const now = new Date();
  const from = new Date(now.getTime());
  from.setDate(from.getDate() - windowDays);

  const fromStr = from.toISOString();
  const toStr = now.toISOString();
  const totals: Record<string, number> = {};

  let offset = 0;
  const limit = 50;
  let total = Infinity;

  while (offset < total) {
    const u = new URL(`${apiBase}/orders/search`);
    u.searchParams.set("seller", String(sellerId));
    u.searchParams.set("order.status", "paid");
    u.searchParams.set("order.date_created.from", fromStr);
    u.searchParams.set("order.date_created.to", toStr);
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("sort", "date_desc");

    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`orders/search failed: ${res.status} ${t}`);
    }

    const data = (await res.json()) as OrderSearchResponse;
    total = data.paging?.total ?? 0;

    for (const order of data.results ?? []) {
      for (const line of order.order_items ?? []) {
        const id = line.item?.id;
        if (!id) continue;
        const q = line.quantity ?? 0;
        totals[id] = (totals[id] ?? 0) + q;
      }
    }

    if ((data.results?.length ?? 0) === 0) break;
    offset += limit;
  }

  return totals;
}
