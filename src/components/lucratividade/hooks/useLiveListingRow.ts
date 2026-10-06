"use client";

import { useEffect, useState } from "react";
import { NETWORK_USER_ERROR, readApiError } from "@/lib/api/api-client-error";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import type { MarginBasis } from "@/lib/pricing/financial-margin";

export type LiveListingRowState =
  | { status: "loading" }
  | { status: "ready"; row: FinancialEvaluationRow }
  /** Anúncio fora de ativo/pausado (ex.: encerrado) — sem dados ao vivo. */
  | { status: "not_operational" }
  | { status: "error"; message: string };

/**
 * Linha do anúncio no preço de HOJE (com preço mínimo p/ meta exato), pro
 * painel. Atacado e "Preço p/ meta" usam esta linha — é a mesma base que a
 * rota de aplicar atacado usa, então o que se confirma é o que vai pro ML.
 */
export function useLiveListingRow(
  mlItemId: string,
  targetMarginPercent: number,
  marginBasis: MarginBasis,
): LiveListingRowState {
  const params = new URLSearchParams({
    itemIds: mlItemId,
    targetMarginPercent: String(targetMarginPercent),
    marginBasis,
  });
  const url = `/api/financial-evaluation?${params.toString()}`;
  // Estado marcado com a URL de origem: anúncio/meta novos começam em
  // "loading" sem reset dentro do effect.
  const [stored, setStored] = useState<{ url: string; state: LiveListingRowState } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    const settle = (state: LiveListingRowState) => {
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
              "Não foi possível consultar este anúncio no Mercado Livre agora. Tente de novo em instantes.",
            ),
          });
          return;
        }
        const json = (await res.json()) as { items: FinancialEvaluationRow[] };
        const row = json.items.find((item) => item.mlItemId === mlItemId);
        settle(row ? { status: "ready", row } : { status: "not_operational" });
      } catch {
        settle({
          status: "error",
          message: NETWORK_USER_ERROR,
        });
      }
    })();
    return () => controller.abort();
  }, [url, mlItemId]);

  return stored?.url === url ? stored.state : { status: "loading" };
}
