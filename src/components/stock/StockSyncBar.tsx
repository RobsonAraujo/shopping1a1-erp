"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBeforeUnloadGuard } from "@/hooks/use-before-unload-guard";
import { StockBlockingOverlay } from "@/components/stock/StockBlockingOverlay";
import { STOCK_SYNC_DONE_EVENT, STOCK_SYNC_START_EVENT } from "@/components/stock/StockBackgroundSync";
import { formatAgo, formatDateTime } from "@/components/stock/stock-format";
import { stockProgressMessage, useStockStream } from "@/components/stock/use-stock-stream";

export type StockSyncBarProps = {
  lastOrdersSyncAt: string | null;
  lastPositionsSyncAt: string | null;
  lastError: string | null;
  running: boolean;
};

/**
 * "Vendas atualizadas há X" + sincronizar. Quem sincroniza sozinho é o
 * `StockBackgroundSync` (no layout, enquanto alguém usa o ERP); aqui só
 * mostramos o andamento dele e os botões: "Sincronizar agora" (vendas +
 * depósito/Full se a última leitura completa passou de 2 h) e "Reler tudo no
 * ML", com tela de bloqueio e progresso.
 */
export function StockSyncBar(props: StockSyncBarProps) {
  const router = useRouter();
  const stream = useStockStream<unknown>();
  const [mode, setMode] = useState<"manual" | "full" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Andamento da sincronização em segundo plano (StockBackgroundSync).
  useEffect(() => {
    const onStart = () => setBackgroundBusy(true);
    const onDone = () => setBackgroundBusy(false);
    window.addEventListener(STOCK_SYNC_START_EVENT, onStart);
    window.addEventListener(STOCK_SYNC_DONE_EVENT, onDone);
    return () => {
      window.removeEventListener(STOCK_SYNC_START_EVENT, onStart);
      window.removeEventListener(STOCK_SYNC_DONE_EVENT, onDone);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const blocking = stream.running;
  useBeforeUnloadGuard(blocking);

  async function run(next: "manual" | "full") {
    setMode(next);
    setError(null);
    const outcome = await stream.start("/api/stock/sync", { positions: next === "full" ? "all" : "auto" });
    setMode(null);
    if (outcome.ok) {
      router.refresh();
    } else if (!("aborted" in outcome && outcome.aborted)) {
      setError(outcome.error);
    }
  }

  const busy = stream.running || backgroundBusy || props.running;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 text-[var(--muted-foreground)]">
              {busy ? (
                <Loader2 className="size-3.5 animate-spin text-[var(--primary)]" aria-hidden />
              ) : props.lastError ? (
                <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />
              ) : (
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
              )}
              {busy && !stream.running
                ? "Atualizando em segundo plano…"
                : `Vendas atualizadas ${formatAgo(props.lastOrdersSyncAt, now)}`}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            <p>Vendas: {formatDateTime(props.lastOrdersSyncAt)}</p>
            <p>Depósito e Full (todos os produtos): {formatDateTime(props.lastPositionsSyncAt)}</p>
            <p className="mt-1 text-[var(--muted-foreground)]">
              Sem cron: enquanto alguém usa o ERP, as vendas novas são lidas em segundo plano (no máximo a cada 10
              min). O depósito e o Full de todos os produtos são relidos ao abrir o Estoque, no máximo a cada 2 horas.
            </p>
            {props.lastError ? <p className="mt-1 text-amber-700">{props.lastError}</p> : null}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button variant="outline" size="sm" onClick={() => void run("manual")} disabled={busy}>
        <RefreshCw aria-hidden />
        Sincronizar agora
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void run("full")} disabled={busy}>
        Reler tudo no ML
      </Button>
      {error ? <span className="text-xs text-[var(--destructive)]">{error}</span> : null}
      {blocking ? (
        <StockBlockingOverlay
          title={mode === "full" ? "Relendo o estoque no Mercado Livre" : "Sincronizando o estoque"}
          message={stockProgressMessage(stream.progress)}
          done={stream.progress?.phase === "positions" ? stream.progress.done : undefined}
          total={stream.progress?.phase === "positions" ? stream.progress.total : undefined}
          onCancel={stream.cancel}
        />
      ) : null}
    </div>
  );
}
