"use client";

import { RefreshCw, SlidersHorizontal, Star } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HomeCustomizeSheet } from "@/components/home/dashboard/HomeCustomizeSheet";
import { HomeViewSwitcher } from "@/components/home/dashboard/HomeViewSwitcher";
import {
  useHomeLayout,
  useHomeWidgetDataContext,
} from "@/components/home/dashboard/HomeDashboardProvider";
import { setDefaultView } from "@/lib/home/dashboard/dashboard-preferences";
import { clearWidgetFetch } from "@/lib/home/dashboard/widget-fetch-cache";

/**
 * Cabeçalho da Home. A identidade do vendedor entra como `children` porque é
 * renderizada no servidor (dentro de um `<Suspense>`); o header em si é client
 * por causa dos controles.
 *
 * Não há botão "Reorganizar": todo card se arrasta pelo próprio header, sempre.
 */
export function HomeDashboardHeader({ children }: { children: ReactNode }) {
  const { preferences, view, activeViewId, update } = useHomeLayout();
  const { reload } = useHomeWidgetDataContext();
  const [customizing, setCustomizing] = useState(false);

  const isVisiting = activeViewId !== preferences.defaultViewId;
  const defaultName =
    preferences.views.find((v) => v.id === preferences.defaultViewId)?.name ?? "";

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">{children}</div>

        <div className="flex shrink-0 items-center gap-2">
          <HomeViewSwitcher />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              // Limpa também o cache dos widgets que buscam sozinhos (PMA e
              // promoções), senão "Atualizar" não atualizaria os dois mais caros.
              clearWidgetFetch();
              reload();
            }}
            aria-label="Atualizar os dados do início"
            title="Atualizar"
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomizing(true)}
          >
            <SlidersHorizontal className="mr-1.5 size-4" aria-hidden />
            Personalizar
          </Button>
        </div>
      </header>

      {isVisiting ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-[var(--primary)]/[0.06] px-4 py-3 text-sm text-[var(--foreground)]"
        >
          <span>
            Visitando «{view.name}». Ao recarregar, o início volta para «
            {defaultName}».
          </span>
          <button
            type="button"
            onClick={() => update((prefs) => setDefaultView(prefs, activeViewId))}
            className="inline-flex items-center gap-1 font-medium text-[var(--primary)] underline underline-offset-2"
          >
            <Star className="size-3.5" aria-hidden />
            Tornar principal
          </button>
        </p>
      ) : null}

      <HomeCustomizeSheet open={customizing} onOpenChange={setCustomizing} />
    </>
  );
}
