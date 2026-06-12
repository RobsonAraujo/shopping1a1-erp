import { getMercadoLibreConfig } from "./config";

export type ItemSalePrice = {
  amount: number;
  regularAmount: number | null;
  currencyId: string | null;
  hasPromotion: boolean;
};

type SalePriceResponse = {
  amount?: number;
  regular_amount?: number | null;
  currency_id?: string;
};

/** Preço de venda vigente no marketplace (já com promoção, se houver). */
export async function fetchItemSalePrice(
  accessToken: string,
  itemId: string,
  fallbackPrice?: number,
): Promise<ItemSalePrice> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/items/${itemId}/sale_price`);
  u.searchParams.set("context", "channel_marketplace");

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    if (fallbackPrice !== undefined && Number.isFinite(fallbackPrice)) {
      return {
        amount: fallbackPrice,
        regularAmount: null,
        currencyId: null,
        hasPromotion: false,
      };
    }
    const text = await res.text();
    throw new Error(`items/${itemId}/sale_price failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as SalePriceResponse;
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    if (fallbackPrice !== undefined && Number.isFinite(fallbackPrice)) {
      return {
        amount: fallbackPrice,
        regularAmount: null,
        currencyId: data.currency_id ?? null,
        hasPromotion: false,
      };
    }
    throw new Error(`items/${itemId}/sale_price returned invalid amount`);
  }

  const regularRaw = data.regular_amount;
  const regularAmount =
    regularRaw !== null &&
    regularRaw !== undefined &&
    Number.isFinite(Number(regularRaw))
      ? Number(regularRaw)
      : null;

  return {
    amount,
    regularAmount,
    currencyId: data.currency_id ?? null,
    hasPromotion: regularAmount !== null && regularAmount > amount,
  };
}
