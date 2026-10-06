"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NETWORK_USER_ERROR } from "@/lib/api/api-client-error";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import {
  isRowBelowTarget,
  type MinPricePatch,
  type MinPricesApiResponse,
} from "@/lib/lucratividade/target-margin";
import type { MarginBasis } from "@/lib/pricing/financial-margin";

const CHUNK_SIZE = 40;

type CacheEntry = MinPricePatch | "not_operational";

/**
 * Preço mínimo p/ meta calculado no ML (taxa e frete no preço sugerido), no
 * preço de hoje de cada anúncio. Fica num cache por anúncio+meta+base fora
 * das linhas — trocar de período só consulta quem ainda não tem resultado.
 *
 * - Simulação: consulta todos os anúncios que entram na média.
 * - Período: só os abaixo da meta (quem já atinge não precisa de preço).
 */
export function useMinPriceOverlay(input: {
  rows: FinancialEvaluationRow[];
  ready: boolean;
  simulation: boolean;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  reloadKey: number;
}) {
  const { rows, ready, simulation, targetMarginPercent, marginBasis, reloadKey } =
    input;
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const [version, setVersion] = useState(0);
  const [refiningIds, setRefiningIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);

  const keyFor = useCallback(
    (id: string) => `${id}|${targetMarginPercent}|${marginBasis}`,
    [targetMarginPercent, marginBasis],
  );

  // "Recalcular" refaz também os preços p/ meta.
  useEffect(() => {
    cacheRef.current.clear();
    setVersion((v) => v + 1);
  }, [reloadKey]);

  const wantedIds = useMemo(() => {
    if (!ready) return [];
    return rows
      .filter(
        (row) =>
          !row.pending &&
          marginExclusionReason(row) === null &&
          (simulation ||
            isRowBelowTarget(row, targetMarginPercent, marginBasis)),
      )
      .map((row) => row.mlItemId)
      .filter((id) => !cacheRef.current.has(keyFor(id)));
    // Sem `version` de propósito: cada lote que volta não deve reiniciar a
    // busca (abortaria o lote seguinte). `reloadKey` limpa o cache e refaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ready, simulation, targetMarginPercent, marginBasis, keyFor, reloadKey]);
  const wantedKey = wantedIds.join(",");

  useEffect(() => {
    if (wantedIds.length === 0) return;
    const controller = new AbortController();
    const { signal } = controller;
    setRefiningIds(new Set(wantedIds));
    setError(null);

    void (async () => {
      try {
        for (let i = 0; i < wantedIds.length; i += CHUNK_SIZE) {
          const chunk = wantedIds.slice(i, i + CHUNK_SIZE);
          const params = new URLSearchParams({
            targetMarginPercent: String(targetMarginPercent),
            marginBasis,
            itemIds: chunk.join(","),
          });
          const res = await fetch(
            `/api/financial-evaluation/min-prices?${params.toString()}`,
            { signal },
          );
          if (signal.aborted) return;
          if (!res.ok) {
            setError(
              "O Mercado Livre não respondeu ao calcular o preço p/ meta. Os valores com ~ são estimativas.",
            );
            return;
          }
          const json = (await res.json()) as MinPricesApiResponse;
          if (signal.aborted) return;
          for (const patch of json.patches) {
            cacheRef.current.set(keyFor(patch.mlItemId), patch);
          }
          for (const id of json.notOperationalIds ?? []) {
            cacheRef.current.set(keyFor(id), "not_operational");
          }
          setRefiningIds((prev) => {
            const next = new Set(prev);
            for (const id of chunk) next.delete(id);
            return next;
          });
          setVersion((v) => v + 1);
        }
      } catch {
        if (!signal.aborted) {
          setError(NETWORK_USER_ERROR);
        }
      } finally {
        if (!signal.aborted) setRefiningIds(new Set());
      }
    })();

    return () => {
      controller.abort();
      setRefiningIds(new Set());
    };
    // `wantedKey` resume `wantedIds`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, targetMarginPercent, marginBasis, keyFor]);

  const getPatch = useCallback(
    (id: string): CacheEntry | undefined => cacheRef.current.get(keyFor(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyFor, version],
  );

  return {
    getPatch,
    refiningIds,
    refining: refiningIds.size > 0,
    error,
  };
}
