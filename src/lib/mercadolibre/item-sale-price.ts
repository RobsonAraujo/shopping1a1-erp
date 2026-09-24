import { getMercadoLibreConfig } from "./config";
import { fetchWithRetry } from "./fetch-with-retry";

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

function fallbackSalePrice(price: number, currencyId: string | null = null) {
  return {
    amount: price,
    regularAmount: null,
    currencyId,
    hasPromotion: false,
  };
}

/**
 * Preço de venda vigente no marketplace (já com promoção, se houver).
 *
 * Com `fallbackPrice`, falha do ML vira o preço de tabela e `hasPromotion:
 * false`. Quem precisa distinguir "sem promoção" de "não deu para consultar"
 * (ex.: o painel de promoções da home) deve omitir o fallback e tratar o erro.
 */
export async function fetchItemSalePrice(
  accessToken: string,
  itemId: string,
  fallbackPrice?: number,
): Promise<ItemSalePrice> {
  const { apiBase } = getMercadoLibreConfig();
  const u = new URL(`${apiBase}/items/${itemId}/sale_price`);
  u.searchParams.set("context", "channel_marketplace");

  const hasFallback =
    fallbackPrice !== undefined && Number.isFinite(fallbackPrice);

  let res: Response;
  try {
    res = await fetchWithRetry(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch (error) {
    if (hasFallback) return fallbackSalePrice(fallbackPrice!);
    throw error;
  }

  const data = (await res.json()) as SalePriceResponse;
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    if (hasFallback) {
      return fallbackSalePrice(fallbackPrice!, data.currency_id ?? null);
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
