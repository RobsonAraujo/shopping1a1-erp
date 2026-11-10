"use client";

import { useCallback, useRef, useState } from "react";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import type {
  RotinaRefreshResult,
  RotinaRefreshStreamEvent,
} from "@/lib/rotina/refresh-events";
import { consumeSSEStream } from "@/hooks/use-sse-stream";

/** Teto de continuações automáticas (cada uma usa até ~4 min). */
const MAX_CONTINUATIONS = 20;

export type RotinaRefreshUiState = {
  running: boolean;
  scope: "all" | "items";
  message: string;
  done: number;
  total: number;
};

const IDLE: RotinaRefreshUiState = {
  running: false,
  scope: "all",
  message: "",
  done: 0,
  total: 0,
};

export type RotinaRefreshOutcome =
  | { kind: "ok"; result: RotinaRefreshResult }
  | { kind: "stopped" }
  | { kind: "error"; message: string };

/**
 * "Atualizar" da Rotina. A rodada roda no servidor em blocos de até ~4 min; quando
 * um bloco termina com `partial`, este hook chama de novo sozinho e o overlay só
 * mostra "continuando". Parar no meio é seguro: cada lote já foi gravado e a
 * próxima atualização continua daí.
 */
export function useRotinaRefresh() {
  const [state, setState] = useState<RotinaRefreshUiState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    controllerRef.current?.abort();
  }, []);

  const run = useCallback(async (itemIds?: string[]): Promise<RotinaRefreshOutcome> => {
    const scope = itemIds && itemIds.length > 0 ? "items" : "all";
    stoppedRef.current = false;
    setState({
      running: true,
      scope,
      message: scope === "items" ? "Recalculando o anúncio…" : "Começando…",
      done: 0,
      total: 0,
    });

    try {
      for (let attempt = 0; attempt < MAX_CONTINUATIONS; attempt++) {
        const controller = new AbortController();
        controllerRef.current = controller;
        const outcome: { done?: RotinaRefreshResult; error?: string } = {};

        try {
          const response = await fetch("/api/rotina/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(scope === "items" ? { itemIds } : {}),
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            outcome.error = await readApiError(response, "rotina_refresh_failed");
          } else {
            await consumeSSEStream<RotinaRefreshStreamEvent>(response, (event) => {
              if (event.type === "stage") {
                setState((current) => ({ ...current, message: event.message }));
              } else if (event.type === "progress") {
                setState((current) => ({ ...current, done: event.done, total: event.total }));
              } else if (event.type === "done") {
                outcome.done = {
                  runId: event.runId,
                  status: event.status,
                  done: event.done,
                  total: event.total,
                  warnings: event.warnings,
                };
              } else if (event.type === "error") {
                outcome.error = formatApiErrorMessage(event.message);
              }
            });
          }
        } catch (e) {
          if (stoppedRef.current) return { kind: "stopped" };
          outcome.error = formatApiErrorMessage(
            e instanceof Error ? e.message : "rotina_refresh_failed",
          );
        }

        if (stoppedRef.current) return { kind: "stopped" };
        if (outcome.error) return { kind: "error", message: outcome.error };
        if (!outcome.done) {
          // Conexão fechou sem o evento final (função encerrada no meio).
          return {
            kind: "error",
            message: formatApiErrorMessage("rotina_refresh_failed"),
          };
        }
        if (outcome.done.status === "ok") return { kind: "ok", result: outcome.done };

        const { done, total } = outcome.done;
        setState((current) => ({
          ...current,
          done,
          total,
          message: `Continuando de onde parou (${done} de ${total})…`,
        }));
      }
      return { kind: "error", message: formatApiErrorMessage("rotina_refresh_failed") };
    } finally {
      controllerRef.current = null;
      setState(IDLE);
    }
  }, []);

  return { state, run, stop };
}
