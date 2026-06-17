import { getMercadoLibreConfig } from "./config";

export type ItemPriceConditions = {
  context_restrictions?: string[];
  min_purchase_unit?: number;
  start_time?: string | null;
  end_time?: string | null;
};

export type ItemPriceRecord = {
  id?: string;
  type?: string;
  amount?: number;
  regular_amount?: number | null;
  currency_id?: string;
  last_updated?: string;
  amount_tax_inclusion_type?: string;
  conditions?: ItemPriceConditions;
};

export type ItemPricesResponse = {
  id: string;
  prices: ItemPriceRecord[];
};

export type NetPriceEligibilityResponse = {
  user_id?: number;
  item_id?: string;
  is_user_eligible?: boolean;
  is_item_eligible?: boolean;
  pending_actions?: unknown[];
  error?: string;
  message?: string;
};

export type QuantityPriceWriteNode = {
  id?: string;
  type?: "standard";
  amount?: number;
  currency_id?: string;
  amount_tax_inclusion_type?: "net";
  conditions?: {
    context_restrictions: string[];
    min_purchase_unit?: number;
  };
};

export type UpdateQuantityPricesBody = {
  prices: QuantityPriceWriteNode[];
};

export type UpdateQuantityPricesResponse = {
  id: string;
  prices: ItemPriceRecord[];
};

function parseMlErrorBody(text: string): string {
  try {
    const json = JSON.parse(text) as {
      message?: string;
      error?: string;
      cause?: Array<{ message?: string }>;
    };
    if (json.message) return json.message;
    if (json.error) return json.error;
    const causeMsg = json.cause?.find((c) => c.message)?.message;
    if (causeMsg) return causeMsg;
  } catch {
    // ignore
  }
  return text.trim() || "Erro desconhecido na API do Mercado Livre";
}

export async function fetchItemPrices(
  accessToken: string,
  itemId: string,
): Promise<ItemPricesResponse> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(`${apiBase}/items/${itemId}/prices`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "show-all-prices": "true",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `items/${itemId}/prices failed: ${res.status} ${parseMlErrorBody(text)}`,
    );
  }

  return res.json() as Promise<ItemPricesResponse>;
}

export async function fetchNetPriceEligibility(
  accessToken: string,
  siteId: string,
  userId: number,
  itemId: string,
): Promise<NetPriceEligibilityResponse> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(
    `${apiBase}/business/v1/sites/${siteId}/users/${userId}/items/${itemId}/options/net-prices/seller/eligibility`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `net-prices eligibility failed: ${res.status} ${parseMlErrorBody(text)}`,
    );
  }

  return res.json() as Promise<NetPriceEligibilityResponse>;
}

export async function updateItemNetQuantityPrices(
  accessToken: string,
  itemId: string,
  body: UpdateQuantityPricesBody,
): Promise<UpdateQuantityPricesResponse> {
  const { apiBase } = getMercadoLibreConfig();
  const res = await fetch(`${apiBase}/items/${itemId}/prices/standard/quantity`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `items/${itemId}/prices/standard/quantity failed: ${res.status} ${parseMlErrorBody(text)}`,
    );
  }

  return res.json() as Promise<UpdateQuantityPricesResponse>;
}

export function isBusinessQuantityPrice(price: ItemPriceRecord): boolean {
  const restrictions = price.conditions?.context_restrictions ?? [];
  return (
    restrictions.includes("user_type_business") &&
    price.conditions?.min_purchase_unit !== undefined &&
    price.conditions.min_purchase_unit !== null
  );
}

export function isRetailStandardPrice(price: ItemPriceRecord): boolean {
  return !isBusinessQuantityPrice(price) && Boolean(price.id);
}

export function eligibilityErrorMessage(
  eligibility: NetPriceEligibilityResponse,
): string | null {
  if (eligibility.is_user_eligible === false) {
    return "Sua conta não está habilitada para preço líquido por quantidade B2B no Mercado Livre.";
  }
  if (eligibility.is_item_eligible === false) {
    return "Este anúncio não está elegível para preço líquido B2B (verifique dados fiscais no ML).";
  }
  if (
    eligibility.is_user_eligible !== true ||
    eligibility.is_item_eligible !== true
  ) {
    return "Não foi possível confirmar elegibilidade para preço líquido B2B.";
  }
  return null;
}
