import { getMercadoLibreConfig } from "./config";
import { listingTypeLabelFromId } from "@/lib/financial-margin";

export type ListingSaleFee = {
  feeAmount: number;
  feePercent: number | null;
  listingTypeId: string;
  listingTypeLabel: string | null;
};

type ListingPriceEntry = {
  listing_type_id?: string;
  listing_type_name?: string;
  mapping?: string;
  sale_fee_amount?: number;
  sale_fee_details?: {
    percentage_fee?: number;
    fixed_fee?: number;
    gross_amount?: number;
  };
};

export function siteIdFromItemId(itemId: string): string {
  const match = itemId.match(/^([A-Z]{3})\d+/i);
  return match ? match[1].toUpperCase() : "MLB";
}

function normalizeListingPriceEntries(data: unknown): ListingPriceEntry[] {
  if (!data) return [];
  if (!Array.isArray(data)) {
    return typeof data === "object" ? [data as ListingPriceEntry] : [];
  }
  if (data.length > 0 && Array.isArray(data[0])) {
    return (data as unknown[][]).flat() as ListingPriceEntry[];
  }
  return data as ListingPriceEntry[];
}

function pickListingPriceEntry(
  entries: ListingPriceEntry[],
  listingTypeId: string,
): ListingPriceEntry | undefined {
  const exact = entries.find((entry) => entry.listing_type_id === listingTypeId);
  if (exact) return exact;
  return entries.find((entry) => entry.mapping === listingTypeId);
}

export async function fetchListingSaleFee(
  accessToken: string,
  params: {
    siteId: string;
    price: number;
    categoryId: string;
    listingTypeId: string;
    currencyId?: string | null;
    logisticType?: string | null;
    shippingMode?: string | null;
  },
): Promise<ListingSaleFee> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/sites/${params.siteId}/listing_prices`);
  u.searchParams.set("price", String(params.price));
  u.searchParams.set("category_id", params.categoryId);
  u.searchParams.set("listing_type_id", params.listingTypeId);

  const currencyId = params.currencyId ?? "BRL";
  u.searchParams.set("currency_id", currencyId);

  if (params.logisticType) {
    u.searchParams.set("logistic_type", params.logisticType);
  }
  if (params.shippingMode) {
    u.searchParams.set("shipping_mode", params.shippingMode);
  }

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`listing_prices failed: ${res.status} ${text}`);
  }

  const entries = normalizeListingPriceEntries(await res.json());
  const match = pickListingPriceEntry(entries, params.listingTypeId);

  if (!match) {
    throw new Error("listing_prices returned no entries for listing type");
  }

  const feeAmount = Number(match.sale_fee_amount ?? 0);
  const feePercentRaw = match.sale_fee_details?.percentage_fee;
  const feePercent =
    feePercentRaw !== undefined && Number.isFinite(Number(feePercentRaw))
      ? Number(feePercentRaw)
      : null;

  return {
    feeAmount,
    feePercent,
    listingTypeId: match.listing_type_id ?? params.listingTypeId,
    listingTypeLabel:
      match.listing_type_name ??
      listingTypeLabelFromId(match.listing_type_id ?? params.listingTypeId),
  };
}
