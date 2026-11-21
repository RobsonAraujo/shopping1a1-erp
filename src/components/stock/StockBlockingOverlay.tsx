"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const emptySubscribe = () => () => {};

/**
 * Tela de bloqueio das ações longas do estoque (ativação na primeira
 * visita, sincronizar), no mesmo formato do sync do DRE: título, etapa, barra de
 * progresso e cancelar. Fechar a aba pede confirmação (quem usa chama
 * `useBeforeUnloadGuard`).
 */
export function StockBlockingOverlay({
  title,
  message,
  note,
  done,
  total,
  onCancel,
}: {
  title: string;
  message: string;
  /** Linha extra, discreta, abaixo do progresso. */
  note?: string;
  done?: number;
  total?: number;
  onCancel?: () => void;
}) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  if (!mounted) return null;
  const pct = total && total > 0 && done != null ? Math.min(100, Math.round((done / total) * 100)) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="stock-overlay-title"
      aria-describedby="stock-overlay-desc"
    >
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--primary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p id="stock-overlay-title" className="text-sm font-semibold text-[var(--foreground)]">
              {title}
            </p>
            <p id="stock-overlay-desc" className="mt-1 text-sm text-[var(--muted-foreground)]">
              {message}
            </p>
            {pct != null ? (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs tabular-nums text-[var(--muted-foreground)]">
                  {done} de {total} produtos · {pct}%
                </p>
              </div>
            ) : null}
            {note ? <p className="mt-3 text-xs text-[var(--muted-foreground)]">{note}</p> : null}
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              Não feche esta aba até terminar.
            </p>
          </div>
        </div>
        {onCancel ? (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Parar
            </Button>
          </div>
        ) : null}
      </Card>
    </div>,
    document.body,
  );
}
