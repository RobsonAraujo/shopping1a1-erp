"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { consumeSSEStream } from "@/hooks/use-sse-stream";
import type { StockStreamEvent } from "@/lib/stock/stock-events";
import type { StockSyncRunResult } from "@/lib/stock/stock-sync";

/** Igual a `STOCK_SYNC_STALE_MS` (stock-sync.ts). */
const MIN_INTERVAL_MS = 10 * 60 * 1000;
/** Estoque não ativado (ou sem permissão): não tenta de novo por 1 h nesta aba. */
const NOT_ACTIVATED_BACKOFF_MS = 60 * 60 * 1000;
/** Atraso grande de vendas (a rodada parou no orçamento): continua logo. */
const CATCH_UP_DELAY_MS = 5 * 1000;
const STORAGE_KEY = "stock-background-sync:next-at";

export const STOCK_SYNC_START_EVENT = "stock-sync:start";
export const STOCK_SYNC_DONE_EVENT = "stock-sync:done";

function readNextAt(): number {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeNextAt(at: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // aba anônima/sem storage: o servidor ainda segura (responde "fresco").
  }
}

/**
 * A ativação acabou de ler tudo: o segundo plano volta ao ritmo normal (e sai
 * do recuo de "não ativado", se a primeira tentativa chegou antes dela).
 */
export function markStockBackgroundSyncFresh() {
  writeNextAt(Date.now() + MIN_INTERVAL_MS);
}

/**
 * Estoque sem cron: enquanto alguém usa o ERP, lê as vendas novas em segundo
 * plano para a baixa automática. Desenho para não pesar em nada:
 *
 * - não recebe dado do servidor (o layout não ganha consulta) e só começa
 *   depois que a página ficou pronta (`requestIdleCallback` / 3 s) — nenhuma
 *   tela espera por ele;
 * - no máximo 1 vez a cada 10 min por aba; o servidor ainda responde
 *   "fresco" na hora (sem chamar o ML) se outra aba ou pessoa já leu;
 * - fora do Estoque só faz o leve (vendas + até 30 produtos que venderam);
 *   na Posição do Estoque relê depósito e Full de tudo, no máximo a cada 2 h.
 */
export function StockBackgroundSync() {
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  const running = useRef(false);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      if (running.current || Date.now() < readNextAt()) return;
      running.current = true;
      writeNextAt(Date.now() + MIN_INTERVAL_MS);
      const positions = pathRef.current === "/dashboard/inventory" ? "auto" : "touched";
      window.dispatchEvent(new CustomEvent(STOCK_SYNC_START_EVENT));
      let result: StockSyncRunResult | null = null;
      try {
        const res = await fetch("/api/stock/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions, background: true }),
        });
        if (!res.ok) {
          // Sessão/organização sem acesso: deixa quieto por um tempo.
          writeNextAt(Date.now() + NOT_ACTIVATED_BACKOFF_MS);
          return;
        }
        await consumeSSEStream<StockStreamEvent<StockSyncRunResult>>(res, (event) => {
          if (event.type === "done") result = event.result;
        });
      } catch {
        // Silencioso: é segundo plano; a próxima navegação tenta de novo.
      } finally {
        running.current = false;
        window.dispatchEvent(new CustomEvent(STOCK_SYNC_DONE_EVENT));
      }
      const done = result as StockSyncRunResult | null;
      if (!done) return;
      if (done.skipped === "not_activated") {
        writeNextAt(Date.now() + NOT_ACTIVATED_BACKOFF_MS);
        return;
      }
      if (!done.skipped && pathRef.current.startsWith("/dashboard/inventory")) router.refresh();
      if (!done.ordersComplete && !cancelled) {
        writeNextAt(0);
        window.setTimeout(() => void run(), CATCH_UP_DELAY_MS);
      }
    }

    const schedule = () => void run();
    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    });
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    if (idle.requestIdleCallback) idleId = idle.requestIdleCallback(schedule, { timeout: 5000 });
    else timeoutId = window.setTimeout(schedule, 3000);

    return () => {
      cancelled = true;
      if (idleId != null) idle.cancelIdleCallback?.(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [pathname, router]);

  return null;
}
