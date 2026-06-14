import { getMercadoLibreConfig } from "./config";
import type { ItemBody } from "./types";

export type SellerShippingCost = {
  cost: number;
  applicable: boolean;
};

type ShippingCoverage = {
  list_cost?: number;
};

type ShippingOptionsFreeResponse = {
  coverage?: {
    all_country?: ShippingCoverage;
  };
};

function itemDimensions(item: ItemBody): string | undefined {
  return item.shipping?.dimensions ?? item.dimensions;
}

type SellerShippingCostParams = {
  sellerId: number;
  item: ItemBody;
  /** Preço efetivo de venda (com promoção); obrigatório para cotação correta na API ML. */
  effectiveSalePrice?: number;
};

function appendShippingQuoteParams(
  u: URL,
  params: SellerShippingCostParams,
): void {
  const itemPrice = params.effectiveSalePrice ?? params.item.price;
  if (Number.isFinite(itemPrice) && itemPrice >= 0) {
    u.searchParams.set("item_price", String(itemPrice));
  }

  const freeShipping = params.item.shipping?.free_shipping;
  if (typeof freeShipping === "boolean") {
    u.searchParams.set("free_shipping", String(freeShipping));
  }

  const mode = params.item.shipping?.mode;
  if (mode) {
    u.searchParams.set("mode", mode);
  }
}

export async function fetchSellerShippingCost(
  accessToken: string,
  params: SellerShippingCostParams,
): Promise<SellerShippingCost> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(
    `${apiBase}/users/${params.sellerId}/shipping_options/free`,
  );
  u.searchParams.set("item_id", params.item.id);
  appendShippingQuoteParams(u, params);

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.ok) {
    return parseShippingCostResponse(
      (await res.json()) as ShippingOptionsFreeResponse,
    );
  }

  if (res.status !== 400 && res.status !== 404) {
    const text = await res.text();
    throw new Error(`shipping_options/free failed: ${res.status} ${text}`);
  }

  return fetchSellerShippingCostFallback(accessToken, params);
}

async function fetchSellerShippingCostFallback(
  accessToken: string,
  params: SellerShippingCostParams,
): Promise<SellerShippingCost> {
  const listingTypeId = params.item.listing_type_id;
  const logisticType = params.item.shipping?.logistic_type;
  const dimensions = itemDimensions(params.item);

  if (!listingTypeId) {
    return { cost: 0, applicable: false };
  }

  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(
    `${apiBase}/users/${params.sellerId}/shipping_options/free`,
  );
  appendShippingQuoteParams(u, params);
  u.searchParams.set("listing_type_id", listingTypeId);
  if (logisticType) {
    u.searchParams.set("logistic_type", logisticType);
  }
  if (dimensions) {
    u.searchParams.set("dimensions", dimensions);
  }

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return { cost: 0, applicable: false };
  }

  return parseShippingCostResponse(
    (await res.json()) as ShippingOptionsFreeResponse,
  );
}

function parseShippingCostResponse(
  data: ShippingOptionsFreeResponse,
): SellerShippingCost {
  const listCost = data.coverage?.all_country?.list_cost;
  if (listCost === undefined || listCost === null) {
    return { cost: 0, applicable: false };
  }
  const cost = Number(listCost);
  if (!Number.isFinite(cost) || cost < 0) {
    return { cost: 0, applicable: false };
  }
  return { cost, applicable: true };
}
