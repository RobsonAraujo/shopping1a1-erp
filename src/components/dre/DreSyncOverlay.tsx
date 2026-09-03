"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dreMonthShortLabel } from "@/lib/dre/dre-table-rows";

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export type DreSyncOverlayItem = {
  month: number;
  message: string;
};

export function DreSyncOverlay({
  year,
  items,
  syncingAll = false,
  onCancel,
}: {
  year: number;
  items: DreSyncOverlayItem[];
  syncingAll?: boolean;
  onCancel?: () => void;
}) {
  const mounted = useIsClient();

  const title =
    syncingAll || items.length > 1
      ? "Sincronizando DRE"
      : `Sincronizando ${dreMonthShortLabel(items[0]?.month ?? 1)}/${year}`;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="dre-sync-overlay-title"
      aria-describedby="dre-sync-overlay-desc"
    >
      <Card className="w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p
              id="dre-sync-overlay-title"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              {title}
            </p>
            <div
              id="dre-sync-overlay-desc"
              className="mt-1 space-y-1 text-sm text-[var(--muted-foreground)]"
            >
              {items.map((item) => (
                <p key={item.month}>
                  {items.length > 1 ? (
                    <>
                      <span className="font-medium text-[var(--foreground)]">
                        {dreMonthShortLabel(item.month)}
                      </span>
                      {": "}
                    </>
                  ) : null}
                  {item.message}
                </p>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
              Consultando Mercado Livre e recalculando o(s) mês(es). Meses
              com muitos pedidos podem levar alguns minutos.
            </p>
            {onCancel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onCancel}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
