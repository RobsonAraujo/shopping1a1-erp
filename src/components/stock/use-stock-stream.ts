"use client";

import { useCallback, useRef, useState } from "react";
import { consumeSSEStream } from "@/hooks/use-sse-stream";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import type { StockStreamEvent } from "@/lib/stock/stock-events";

export type StockStreamProgress = {
  phase: "listings" | "orders" | "positions" | "saving";
  done?: number;
  total?: number;
};

export type StockStreamOutcome<TDone> =
  | { ok: true; result: TDone }
  | { ok: false; error: string; aborted?: boolean };

/** Roda uma ação SSE do estoque e acompanha o progresso. */
export function useStockStream<TDone>() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<StockStreamProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (url: string, body: unknown): Promise<StockStreamOutcome<TDone>> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setProgress(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
          signal: controller.signal,
        });
        if (!res.ok) return { ok: false, error: await readApiError(res, "stock_action_failed") };
        let outcome: StockStreamOutcome<TDone> | null = null;
        await consumeSSEStream<StockStreamEvent<TDone>>(res, (event) => {
          if (event.type === "progress") {
            setProgress({ phase: event.phase, done: event.done, total: event.total });
          } else if (event.type === "done") {
            outcome = { ok: true, result: event.result };
          } else if (event.type === "error") {
            outcome = { ok: false, error: formatApiErrorMessage(event.message) };
          }
        });
        return outcome ?? { ok: false, error: formatApiErrorMessage("stream_failed") };
      } catch (e) {
        if (controller.signal.aborted) return { ok: false, error: "Parado.", aborted: true };
        return { ok: false, error: formatApiErrorMessage(e instanceof Error ? e.message : "stream_failed") };
      } finally {
        abortRef.current = null;
        setRunning(false);
      }
    },
    [],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { running, progress, start, cancel };
}

export function stockProgressMessage(progress: StockStreamProgress | null): string {
  if (!progress) return "Começando…";
  if (progress.phase === "listings") return "Lendo seus anúncios no Mercado Livre…";
  if (progress.phase === "orders") return "Lendo as vendas novas…";
  if (progress.phase === "saving") return "Gravando o saldo inicial de cada produto…";
  return "Lendo depósito e Full de cada produto no Mercado Livre…";
}
