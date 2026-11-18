"use client";

import { useEffect, useState } from "react";
import { NETWORK_USER_ERROR, readApiError } from "@/lib/api/api-client-error";
import type { SalesMixForItem } from "@/lib/lucratividade/sales-mix";

/** Período da linha aberta no painel — `ordersFetchedAt` corta pedidos que chegaram depois. */
export type SalesMixPeriod = {
  from: string;
  to: string;
  ordersFetchedAt: string | null;
};

export type SalesMixState =
  | { status: "loading" }
  | { status: "ready"; data: SalesMixForItem }
  | { status: "error"; message: string };

export function salesMixUrl(mlItemId: string, period: SalesMixPeriod): string {
  const params = new URLSearchParams({
    itemId: mlItemId,
    from: period.from,
    to: period.to,
  });
  if (period.ordersFetchedAt) params.set("until", period.ordersFetchedAt);
  return `/api/financial-evaluation/sales-mix?${params.toString()}`;
}

/**
 * Composição das vendas do anúncio com a forma de envio de cada pedido —
 * busca sob demanda, só quando o painel abre num período de vendas.
 */
export function useSalesMix(
  mlItemId: string,
  period: SalesMixPeriod | null,
): SalesMixState | null {
  const url = period ? salesMixUrl(mlItemId, period) : null;
  // Estado marcado com a URL de origem: anúncio/período novos começam em
  // "loading" sem reset dentro do effect.
  const [stored, setStored] = useState<{ url: string; state: SalesMixState } | null>(
    null,
  );

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const settle = (state: SalesMixState) => {
      if (!controller.signal.aborted) setStored({ url, state });
    };
    void (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          settle({
            status: "error",
            message: await readApiError(
              res,
              "Não foi possível classificar os envios no Mercado Livre agora.",
            ),
          });
          return;
        }
        const json = (await res.json()) as Partial<SalesMixForItem> | null;
        if (!json || !Array.isArray(json.entries) || !json.shipments) {
          settle({
            status: "error",
            message: "Resposta inesperada ao classificar os envios.",
          });
          return;
        }
        settle({ status: "ready", data: json as SalesMixForItem });
      } catch {
        settle({ status: "error", message: NETWORK_USER_ERROR });
      }
    })();
    return () => controller.abort();
  }, [url]);

  if (!url) return null;
  return stored?.url === url ? stored.state : { status: "loading" };
}
