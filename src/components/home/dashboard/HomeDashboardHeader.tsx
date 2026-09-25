"use client";

import { Check, LayoutGrid, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HomeCustomizeSheet } from "@/components/home/dashboard/HomeCustomizeSheet";
import {
  useHomeLayout,
  useHomeWidgetDataContext,
} from "@/components/home/dashboard/HomeDashboardProvider";

/**
 * Cabeçalho da Home. A identidade do vendedor entra como `children` porque
 * ela é renderizada no servidor (dentro de um `<Suspense>`) — o header em si é
 * client por causa dos botões.
 */
export function HomeDashboardHeader({ children }: { children: ReactNode }) {
  const { editing, setEditing } = useHomeLayout();
  const { reload } = useHomeWidgetDataContext();
  const [customizing, setCustomizing] = useState(false);

  // Escape sai do modo de edição — atalho esperado de qualquer modo temporário.
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, setEditing]);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">{children}</div>

        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <Button size="sm" onClick={() => setEditing(false)}>
              <Check className="mr-1.5 size-4" aria-hidden />
              Concluir
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => reload()}
                aria-label="Atualizar os dados do início"
                title="Atualizar"
              >
                <RefreshCw className="size-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <LayoutGrid className="mr-1.5 size-4" aria-hidden />
                Reorganizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomizing(true)}
              >
                <SlidersHorizontal className="mr-1.5 size-4" aria-hidden />
                Personalizar
              </Button>
            </>
          )}
        </div>
      </header>

      {editing ? (
        <p
          role="status"
          className="rounded-2xl bg-[var(--primary)]/[0.06] px-4 py-3 text-sm text-[var(--foreground)]"
        >
          Arraste os cards pela alça no canto de cada um para reordenar. Com o
          teclado, chegue até a alça com Tab e use espaço e as setas. Para
          mostrar, esconder ou redimensionar, use{" "}
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            className="font-medium text-[var(--primary)] underline underline-offset-2"
          >
            Personalizar
          </button>
          .
        </p>
      ) : null}

      <HomeCustomizeSheet open={customizing} onOpenChange={setCustomizing} />
    </>
  );
}
