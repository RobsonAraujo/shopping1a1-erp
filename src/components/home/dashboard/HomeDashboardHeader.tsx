"use client";

import { RefreshCw, SlidersHorizontal, Star } from "lucide-react";
import { useState, type ReactNode } from "react";
import { HomeCustomizeSheet } from "@/components/home/dashboard/HomeCustomizeSheet";
import { HomeViewSwitcher } from "@/components/home/dashboard/HomeViewSwitcher";
import {
  useHomeLayout,
  useHomeWidgetDataContext,
} from "@/components/home/dashboard/HomeDashboardProvider";
import { setDefaultView } from "@/lib/home/dashboard/dashboard-preferences";
import { clearWidgetFetch } from "@/lib/home/dashboard/widget-fetch-cache";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho da Home. A identidade do vendedor entra como `children` porque é
 * renderizada no servidor (dentro de um `<Suspense>`); o header em si é client
 * por causa dos controles.
 *
 * Não há botão "Reorganizar": todo card se arrasta pelo próprio header, sempre.
 *
 * Os controles seguem a mesma linguagem de pills do seletor de versões: dois
 * clusters arredondados em vez de botões soltos de alturas diferentes. No celular
 * "Personalizar" fica só com o ícone — o cabeçalho tem que caber numa linha ao
 * lado do nome da loja.
 */
const ACTION_BASE =
  "flex cursor-pointer items-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:outline-none";

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

          <div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--muted)]/60 p-1">
            <button
              type="button"
              onClick={() => {
                // Limpa também o cache dos widgets que buscam sozinhos (PMA e
                // promoções), senão "Atualizar" não atualizaria os dois mais
                // caros.
                clearWidgetFetch();
                reload();
              }}
              aria-label="Atualizar os dados do início"
              title="Atualizar"
              className={cn(ACTION_BASE, "px-2 text-[var(--muted-foreground)]")}
            >
              <RefreshCw className="size-4" aria-hidden />
            </button>

            <button
              type="button"
              onClick={() => setCustomizing(true)}
              title="Personalizar"
              className={cn(
                ACTION_BASE,
                "bg-[var(--card)] px-3 text-[var(--foreground)] shadow-sm ring-1 ring-[var(--border)]",
              )}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              <span className="hidden sm:inline">Personalizar</span>
              <span className="sr-only sm:hidden">Personalizar</span>
            </button>
          </div>
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
            className="inline-flex cursor-pointer items-center gap-1 font-medium text-[var(--primary)] underline underline-offset-2"
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
