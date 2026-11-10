"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RotinaRefreshUiState } from "@/components/rotina/use-rotina-refresh";

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Bloqueia a tela durante o "Atualizar" (mesmo padrão do sync do DRE): a rodada
 * consulta o Mercado Livre por minutos e o usuário precisa ver o que está
 * acontecendo. Parar é seguro — cada lote já foi gravado.
 */
export function RotinaRefreshOverlay({
  state,
  onStop,
}: {
  state: RotinaRefreshUiState;
  onStop: () => void;
}) {
  const mounted = useIsClient();
  if (!mounted || !state.running) return null;

  const percent =
    state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : null;
  const title =
    state.scope === "items" ? "Recalculando o anúncio" : "Atualizando seus anúncios";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="rotina-refresh-title"
      aria-describedby="rotina-refresh-desc"
    >
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p
              id="rotina-refresh-title"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              {title}
            </p>
            <p
              id="rotina-refresh-desc"
              className="mt-1 text-sm text-[var(--muted-foreground)]"
            >
              {state.message}
            </p>
            {percent !== null ? (
              <div className="mt-3">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={state.total}
                  aria-valuenow={state.done}
                >
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-1 text-xs tabular-nums text-[var(--muted-foreground)]">
                  {state.done} de {state.total} anúncios
                </p>
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
              {state.scope === "items"
                ? "Cotando taxa e frete no Mercado Livre para achar o preço mínimo."
                : "Consultando o Mercado Livre: margem, preço mínimo, ADS e promoções de cada anúncio. Costuma levar alguns minutos."}
            </p>
            {state.scope === "all" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onStop}
              >
                Parar aqui
              </Button>
            ) : null}
            {state.scope === "all" ? (
              <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
                O que já foi calculado fica salvo; a próxima atualização continua daqui.
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
