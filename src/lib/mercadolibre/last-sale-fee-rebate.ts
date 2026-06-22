import { getMercadoLibreConfig } from "./config";
import { fetchListingSaleFee, siteIdFromItemId } from "./listing-fees";
import type {
  OrderSearchOrder,
  OrderSearchOrderItem,
  OrderSearchResponse,
} from "./types";

export type LastSaleFeeRebate = {
  rebate: number;
  orderId: string;
  gross: number | null;
  net: number | null;
};

type BillingSaleFee = {
  gross?: number;
  net?: number;
  rebate?: number;
};

type BillingOrderDetailsResponse = {
  results?: Array<{
    order_id?: number | string;
    sale_fee?: BillingSaleFee;
  }>;
};

export type LastSaleFeeRebateFeeContext = {
  categoryId: string;
  listingTypeId: string;
  currencyId?: string | null;
  logisticType?: string | null;
  shippingMode?: string | null;
};

function orderIdFromSearchResult(order: OrderSearchOrder): string | null {
  const id = order.id;
  if (id === undefined || id === null) return null;
  const text = String(id).trim();
  return text ? text : null;
}

function orderItemForListing(
  order: OrderSearchOrder,
  itemId: string,
): OrderSearchOrderItem | undefined {
  return order.order_items?.find(
    (line) => line.item?.id === itemId || line.item_id === itemId,
  );
}

async function rebateFromOrderSaleFee(
  accessToken: string,
  itemId: string,
  order: OrderSearchOrder,
  orderId: string,
  feeContext: LastSaleFeeRebateFeeContext,
): Promise<LastSaleFeeRebate | null> {
  const line = orderItemForListing(order, itemId);
  const chargedFee = Number(line?.sale_fee);
  const unitPrice = Number(line?.unit_price);
  if (
    !Number.isFinite(chargedFee) ||
    chargedFee < 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    return null;
  }

  let grossFee: number;
  try {
    const projected = await fetchListingSaleFee(accessToken, {
      siteId: siteIdFromItemId(itemId),
      price: unitPrice,
      categoryId: feeContext.categoryId,
      listingTypeId: feeContext.listingTypeId,
      currencyId: feeContext.currencyId,
      logisticType: feeContext.logisticType,
      shippingMode: feeContext.shippingMode,
    });
    grossFee = projected.feeAmount;
  } catch {
    return null;
  }

  const rebate = Math.round((grossFee - chargedFee) * 100) / 100;
  if (!Number.isFinite(rebate) || rebate <= 0) {
    return null;
  }

  return {
    rebate,
    orderId,
    gross: grossFee,
    net: chargedFee,
  };
}

/** Rebate de tarifa da última venda paga (MLB billing). Retorna null se indisponível ou zero. */
export async function fetchLastSaleFeeRebate(
  accessToken: string,
  sellerId: number,
  itemId: string,
  feeContext?: LastSaleFeeRebateFeeContext,
): Promise<LastSaleFeeRebate | null> {
  if (siteIdFromItemId(itemId) !== "MLB") {
    return null;
  }

  const { apiBase } = getMercadoLibreConfig();
  const searchUrl = new URL(`${apiBase}/orders/search`);
  searchUrl.searchParams.set("seller", String(sellerId));
  searchUrl.searchParams.set("item", itemId);
  searchUrl.searchParams.set("order.status", "paid");
  searchUrl.searchParams.set("sort", "date_desc");
  searchUrl.searchParams.set("limit", "1");

  let searchRes: Response;
  try {
    searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!searchRes.ok) {
    return null;
  }

  let searchData: OrderSearchResponse;
  try {
    searchData = (await searchRes.json()) as OrderSearchResponse;
  } catch {
    return null;
  }

  const lastOrder = searchData.results?.[0];
  if (!lastOrder) return null;

  const orderId = orderIdFromSearchResult(lastOrder);
  if (!orderId) return null;

  const tryOrderSaleFeeFallback = () =>
    feeContext
      ? rebateFromOrderSaleFee(
          accessToken,
          itemId,
          lastOrder,
          orderId,
          feeContext,
        )
      : Promise.resolve(null);

  const billingUrl = new URL(
    `${apiBase}/billing/integration/group/ML/order/details`,
  );
  billingUrl.searchParams.set("order_ids", orderId);

  let billingRes: Response;
  try {
    billingRes = await fetch(billingUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return tryOrderSaleFeeFallback();
  }

  if (!billingRes.ok) {
    return tryOrderSaleFeeFallback();
  }

  let billingData: BillingOrderDetailsResponse;
  try {
    billingData = (await billingRes.json()) as BillingOrderDetailsResponse;
  } catch {
    return tryOrderSaleFeeFallback();
  }

  const saleFee = billingData.results?.[0]?.sale_fee;
  const rebateRaw = saleFee?.rebate;
  const rebateTotal = Number(rebateRaw);
  if (Number.isFinite(rebateTotal) && rebateTotal > 0) {
    // rebate da billing API é o total do pedido; divide pela quantidade para obter por unidade
    const line = orderItemForListing(lastOrder, itemId);
    const qty = Math.max(1, Math.floor(Number(line?.quantity ?? 1)));
    const rebate = Math.round((rebateTotal / qty) * 100) / 100;

    const grossRaw = saleFee?.gross;
    const netRaw = saleFee?.net;
    const gross =
      grossRaw !== undefined && Number.isFinite(Number(grossRaw))
        ? Math.round((Number(grossRaw) / qty) * 100) / 100
        : null;
    const net =
      netRaw !== undefined && Number.isFinite(Number(netRaw))
        ? Math.round((Number(netRaw) / qty) * 100) / 100
        : null;

    return {
      rebate,
      orderId,
      gross,
      net,
    };
  }

  return tryOrderSaleFeeFallback();
}
