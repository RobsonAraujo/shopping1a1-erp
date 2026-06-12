import { reportsConfig } from "@/config/reports";
import { getZonedParts, atReportTime } from "@/lib/report-timezone";
import { getMercadoLibreConfig } from "./config";

export const PRODUCT_ADS_PERIOD_DAYS = 7;

const ADS_SEARCH_METRICS =
  "cost,acos,total_amount,organic_units_amount,units_quantity,direct_amount,indirect_amount,advertising_items_quantity";

export type ItemAdMetrics = {
  itemId: string;
  status: string | null;
  cost: number;
  acosPercent: number | null;
  totalAmount: number;
  organicAmount: number;
  unitsQuantity: number;
  totalRevenue: number;
  tacosPercent: number | null;
};

type AdvertisersResponse = {
  advertisers?: Array<{
    advertiser_id?: number;
    site_id?: string;
  }>;
};

type AdMetricsPayload = {
  cost?: number;
  acos?: number;
  total_amount?: number;
  organic_units_amount?: number;
  units_quantity?: number;
};

type AdSearchResult = {
  item_id?: string;
  status?: string;
  metrics?: AdMetricsPayload;
};

type AdSearchResponse = {
  results?: AdSearchResult[];
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
};

function padsHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "api-version": "2",
  };
}

function formatYmd(parts: { year: number; month: number; day: number }): string {
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${parts.year}-${m}-${d}`;
}

export function getProductAdsDateRange(
  periodDays = PRODUCT_ADS_PERIOD_DAYS,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): { dateFrom: string; dateTo: string } {
  const todayParts = getZonedParts(new Date(), timeZone);
  const dateTo = formatYmd(todayParts);
  const fromDate = atReportTime(
    new Date(),
    Math.max(0, periodDays - 1),
    0,
    0,
    timeZone,
  );
  const dateFrom = formatYmd(getZonedParts(fromDate, timeZone));
  return { dateFrom, dateTo };
}

export function computeTacosPercent(
  cost: number,
  totalAmount: number,
  organicAmount: number,
): number | null {
  const totalRevenue = totalAmount + organicAmount;
  if (totalRevenue > 0) {
    return Math.round((cost / totalRevenue) * 10000) / 100;
  }
  if (cost > 0) return null;
  return 0;
}

function parseAdMetrics(entry: AdSearchResult): ItemAdMetrics | null {
  const itemId = entry.item_id?.trim();
  if (!itemId) return null;

  const metrics = entry.metrics ?? {};
  const cost = Number(metrics.cost ?? 0);
  const totalAmount = Number(metrics.total_amount ?? 0);
  const organicAmount = Number(metrics.organic_units_amount ?? 0);
  const unitsQuantity = Number(metrics.units_quantity ?? 0);
  const acosRaw = metrics.acos;
  const acosPercent =
    acosRaw !== undefined && Number.isFinite(Number(acosRaw))
      ? Math.round(Number(acosRaw) * 100) / 100
      : null;

  return {
    itemId,
    status: entry.status ?? null,
    cost: Number.isFinite(cost) ? cost : 0,
    acosPercent,
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    organicAmount: Number.isFinite(organicAmount) ? organicAmount : 0,
    unitsQuantity: Number.isFinite(unitsQuantity) ? unitsQuantity : 0,
    totalRevenue: totalAmount + organicAmount,
    tacosPercent: computeTacosPercent(cost, totalAmount, organicAmount),
  };
}

export async function fetchPadsAdvertiserId(
  accessToken: string,
  siteId = "MLB",
): Promise<number | null> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/advertising/advertisers`);
  u.searchParams.set("product_id", "PADS");

  const res = await fetch(u.toString(), {
    headers: padsHeaders(accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`advertising/advertisers failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as AdvertisersResponse;
  const advertisers = data.advertisers ?? [];
  if (advertisers.length === 0) return null;

  const forSite = advertisers.find(
    (row) => row.site_id?.toUpperCase() === siteId.toUpperCase(),
  );
  const chosen = forSite ?? advertisers[0];
  const id = chosen?.advertiser_id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export async function fetchProductAdsMetricsByItem(
  accessToken: string,
  params: {
    advertiserId: number;
    siteId: string;
    dateFrom: string;
    dateTo: string;
    itemIds?: string[];
  },
): Promise<Map<string, ItemAdMetrics>> {
  const { apiBase } = getMercadoLibreConfig();
  const out = new Map<string, ItemAdMetrics>();
  const limit = 50;
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const u = new URL(
      `${apiBase}/advertising/${params.siteId}/advertisers/${params.advertiserId}/product_ads/ads/search`,
    );
    u.searchParams.set("date_from", params.dateFrom);
    u.searchParams.set("date_to", params.dateTo);
    u.searchParams.set("metrics", ADS_SEARCH_METRICS);
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("offset", String(offset));

    if (params.itemIds && params.itemIds.length > 0) {
      u.searchParams.set("filters[item_id]", params.itemIds.join(","));
    }

    const res = await fetch(u.toString(), {
      headers: padsHeaders(accessToken),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`product_ads/ads/search failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as AdSearchResponse;
    const batch = data.results ?? [];
    const reportedTotal = data.paging?.total;

    for (const entry of batch) {
      const parsed = parseAdMetrics(entry);
      if (parsed) out.set(parsed.itemId, parsed);
    }

    if (reportedTotal != null && reportedTotal >= 0) {
      total = reportedTotal;
    } else if (batch.length < limit) {
      break;
    }

    offset += limit;
    if (batch.length === 0) break;
  }

  return out;
}
