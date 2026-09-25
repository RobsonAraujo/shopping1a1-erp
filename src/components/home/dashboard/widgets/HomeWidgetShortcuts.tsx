"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { HomeWidgetCard } from "@/components/home/dashboard/HomeWidgetCard";
import { useHomeLayout } from "@/components/home/dashboard/HomeDashboardProvider";
import { setWidgetSettings } from "@/lib/home/dashboard/dashboard-preferences";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import { getAllDashboardNavItems } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

const DEFINITION = getHomeWidgetDefinition("atalhos");
const SETTINGS_PREFIX = "pin:";
const DEFAULT_SHORTCUTS = [
  "/dashboard/produtos",
  "/dashboard/compras",
  "/dashboard/inventory",
  "/dashboard/dre",
];

/**
 * Atalhos configuráveis. As telas vêm de `getAllDashboardNavItems()` — a mesma
 * fonte da navegação —, então um atalho nunca aponta pra rota que não existe,
 * e uma tela nova aparece aqui sozinha.
 *
 * A escolha do usuário mora no `settings` do próprio widget (chaves
 * `pin:<href>`), que o normalizador já sabe sanear: só primitivos, com teto de
 * chaves e de tamanho.
 */
export function HomeWidgetShortcuts() {
  const { widgets, update } = useHomeLayout();
  const navItems = useMemo(
    () => getAllDashboardNavItems().filter((item) => item.href !== "/dashboard"),
    [],
  );

  const settings = widgets.find((w) => w.id === "atalhos")?.settings;
  const pinned = useMemo(() => {
    const explicit = Object.entries(settings ?? {})
      .filter(([key, value]) => key.startsWith(SETTINGS_PREFIX) && value === true)
      .map(([key]) => key.slice(SETTINGS_PREFIX.length));
    // Sem escolha do usuário o widget já vem útil, com as telas mais usadas.
    const hasChoice = Object.keys(settings ?? {}).some((key) =>
      key.startsWith(SETTINGS_PREFIX),
    );
    return new Set(hasChoice ? explicit : DEFAULT_SHORTCUTS);
  }, [settings]);

  if (!DEFINITION) return null;

  const toggle = (href: string, next: boolean) => {
    const current = Object.fromEntries(
      Object.entries(settings ?? {}).filter(([key]) =>
        key.startsWith(SETTINGS_PREFIX),
      ),
    );
    // Primeira edição materializa os defaults, pra desmarcar um atalho padrão
    // não trazer os outros de volta na próxima leitura.
    if (Object.keys(current).length === 0) {
      for (const shortcut of DEFAULT_SHORTCUTS) {
        current[`${SETTINGS_PREFIX}${shortcut}`] = true;
      }
    }
    current[`${SETTINGS_PREFIX}${href}`] = next;
    update((prefs) => setWidgetSettings(prefs, "atalhos", current));
  };

  const visible = navItems.filter((item) => pinned.has(item.href));

  return (
    <HomeWidgetCard
      definition={DEFINITION}
      actions={
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Escolher atalhos"
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-80 w-72 overflow-y-auto p-2">
            <p className="px-2 py-1.5 text-xs font-medium text-[var(--muted-foreground)]">
              Escolha os atalhos
            </p>
            <ul>
              {navItems.map((item) => (
                <li
                  key={item.href}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--muted)]/50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.label}
                  </span>
                  <Switch
                    checked={pinned.has(item.href)}
                    onCheckedChange={(next) => toggle(item.href, next)}
                    aria-label={`Atalho para ${item.label}`}
                  />
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      }
    >
      {visible.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nenhum atalho escolhido. Use o lápis para escolher as telas que você
          mais usa.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-medium transition-colors",
                    "hover:border-[var(--primary)]/40 hover:bg-[var(--muted)]/40",
                  )}
                >
                  <Icon
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </HomeWidgetCard>
  );
}
