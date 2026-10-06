"use client";

import { useEffect, useState } from "react";
import { consumeSSEStream } from "@/hooks/use-sse-stream";
import {
  NETWORK_USER_ERROR,
  formatApiErrorMessage,
  readApiError,
} from "@/lib/api/api-client-error";
import type {
  FinancialEvaluationMeta,
  FinancialEvaluationProgress,
  FinancialEvaluationRow,
} from "@/lib/lucratividade/financial-evaluation-data";
import type {
  FinancialEvaluationCompletePayload,
  FinancialEvaluationStreamEvent,
} from "@/lib/lucratividade/financial-evaluation-stream";

export type EvaluationRequest =
  | { kind: "period"; from: string; to: string }
  | { kind: "simulation" };

export type EvaluationStreamStatus =
  | "loading"
  | "done"
  | "error"
  /** O stream acabou sem `complete` (ex.: timeout de 300s no servidor). */
  | "interrupted";

export type EvaluationStreamState = {
  status: EvaluationStreamStatus;
  rows: FinancialEvaluationRow[];
  meta: FinancialEvaluationMeta | null;
  progress: FinancialEvaluationProgress | null;
  complete: FinancialEvaluationCompletePayload | null;
  error: string | null;
};

const INITIAL_STATE: EvaluationStreamState = {
  status: "loading",
  rows: [],
  meta: null,
  progress: null,
  complete: null,
  error: null,
};

export function evaluationStreamUrl(request: EvaluationRequest): string {
  const params = new URLSearchParams({ stream: "1" });
  if (request.kind === "period") {
    params.set("from", request.from);
    params.set("to", request.to);
  }
  return `/api/financial-evaluation?${params.toString()}`;
}

/** Troca no lugar quem já existe (prévia → final) e anexa o resto no fim —
 * sem isso cada linha "pularia" pro final assim que resolvesse.
 *
 * Precisa ser pura (não mexer em `batch`): roda dentro do updater do
 * setState, que o StrictMode chama duas vezes em dev. Quando apagava do
 * lote, a 2ª chamada não achava mais a versão final e a prévia borrada
 * ficava pra sempre. */
function mergeRows(
  prev: FinancialEvaluationRow[],
  batch: ReadonlyMap<string, FinancialEvaluationRow>,
): FinancialEvaluationRow[] {
  if (batch.size === 0) return prev;
  const replaced = new Set<string>();
  const next = prev.map((row) => {
    const replacement = batch.get(row.mlItemId);
    if (!replacement) return row;
    replaced.add(row.mlItemId);
    return replacement;
  });
  for (const [id, row] of batch) {
    if (!replaced.has(id)) next.push(row);
  }
  return next;
}

/** Busca que parou no meio (erro/timeout): prévia sem versão final não pode
 * ficar borrada pra sempre — vira "Erro no cálculo" (fora da média). */
function settlePendingRows(
  rows: FinancialEvaluationRow[],
): FinancialEvaluationRow[] {
  if (!rows.some((row) => row.pending)) return rows;
  return rows.map((row) =>
    row.pending
      ? {
          ...row,
          pending: false,
          breakdown: null,
          marginAfterAdsPercent: null,
          marginAfterAdsValue: null,
          errors: [
            ...row.errors,
            "A busca no Mercado Livre parou antes de calcular este anúncio.",
          ],
        }
      : row,
  );
}

const scheduleFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number;
const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === "function"
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id);

/**
 * Carrega a Lucratividade via SSE. Cada mudança de `request` (ou de
 * `reloadKey`) aborta o stream anterior — eventos atrasados dele são
 * descartados, então trocar de período rápido nunca mistura linhas de dois
 * períodos. Linhas chegam em lote por frame (90 dias = centenas de linhas).
 */
export function useEvaluationStream(
  /** `null` = ainda não dá pra montar o pedido (ex.: antes do mount). */
  request: EvaluationRequest | null,
  reloadKey: number,
): EvaluationStreamState {
  const url = request ? evaluationStreamUrl(request) : null;
  const key = url ? `${url}#${reloadKey}` : null;
  // O estado guarda de qual pedido ele é: pedido novo já começa "zerado" sem
  // precisar resetar dentro do effect.
  const [stored, setStored] = useState<{
    key: string | null;
    state: EvaluationStreamState;
  }>({ key: null, state: INITIAL_STATE });

  useEffect(() => {
    if (!url || !key) return;
    const controller = new AbortController();
    const { signal } = controller;
    let pendingRows = new Map<string, FinancialEvaluationRow>();
    let frame: number | null = null;

    const update = (fn: (prev: EvaluationStreamState) => EvaluationStreamState) => {
      if (signal.aborted) return;
      setStored((prev) => ({
        key,
        state: fn(prev.key === key ? prev.state : INITIAL_STATE),
      }));
    };
    const flushRows = () => {
      if (frame !== null) {
        cancelFrame(frame);
        frame = null;
      }
      if (pendingRows.size === 0) return;
      const batch = pendingRows;
      pendingRows = new Map();
      update((prev) => ({ ...prev, rows: mergeRows(prev.rows, batch) }));
    };

    void (async () => {
      let completed = false;
      try {
        const res = await fetch(url, { signal });
        if (!res.ok || !res.body) {
          const message = await readApiError(res, "financial_evaluation_failed");
          update((prev) => ({ ...prev, status: "error", error: message }));
          return;
        }
        await consumeSSEStream<FinancialEvaluationStreamEvent>(res, (event) => {
          if (signal.aborted) return;
          switch (event.type) {
            case "row":
              pendingRows.set(event.row.mlItemId, event.row);
              if (frame === null) frame = scheduleFrame(flushRows);
              break;
            case "meta":
              update((prev) => ({
                ...prev,
                meta: {
                  listingCount: event.listingCount,
                  adsAvailable: event.adsAvailable,
                  adsUnavailableReason: event.adsUnavailableReason,
                  droppedListings: event.droppedListings,
                },
              }));
              break;
            case "progress":
              update((prev) => ({
                ...prev,
                progress: {
                  stage: event.stage,
                  fetched: event.fetched,
                  total: event.total,
                },
              }));
              break;
            case "complete":
              completed = true;
              flushRows();
              update((prev) => ({
                ...prev,
                status: "done",
                complete: {
                  mode: event.mode,
                  from: event.from,
                  to: event.to,
                  salesCount: event.salesCount,
                  periodDays: event.periodDays,
                },
              }));
              break;
            case "error":
              completed = true;
              flushRows();
              update((prev) => ({
                ...prev,
                rows: settlePendingRows(prev.rows),
                status: "error",
                error: formatApiErrorMessage(event.message),
              }));
              break;
          }
        });
        if (!completed) {
          flushRows();
          update((prev) => ({
            ...prev,
            rows: settlePendingRows(prev.rows),
            status: "interrupted",
          }));
        }
      } catch {
        if (signal.aborted) return;
        flushRows();
        update((prev) => ({
          ...prev,
          rows: settlePendingRows(prev.rows),
          status: "error",
          error: NETWORK_USER_ERROR,
        }));
      }
    })();

    return () => {
      controller.abort();
      if (frame !== null) cancelFrame(frame);
    };
  }, [url, key]);

  return stored.key === key ? stored.state : INITIAL_STATE;
}
