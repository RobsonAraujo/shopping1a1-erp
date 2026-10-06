"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type SegmentedTab<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Etiqueta curta ao lado do rótulo (ex.: "Em breve"). */
  badge?: string;
  /** Explicação mostrada em tooltip quando a aba está desabilitada. */
  disabledHint?: string;
};

/**
 * Abas em pílula (role="tablist"), no mesmo visual do seletor de Potencial de
 * faturamento. Setas ←/→ trocam de aba. Os painéis ficam com quem usa:
 * `id={tabPanelId(baseId, tab)}` + `aria-labelledby={tabId(baseId, tab)}`.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  baseId,
  ariaLabel,
  className,
}: {
  tabs: SegmentedTab<T>[];
  value: T;
  onValueChange: (value: T) => void;
  baseId: string;
  ariaLabel: string;
  className?: string;
}) {
  const refs = React.useRef(new Map<T, HTMLButtonElement>());

  function focusSibling(current: T, step: 1 | -1) {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.id === current);
    if (index === -1) return;
    const next = enabled[(index + step + enabled.length) % enabled.length];
    onValueChange(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        const Icon = tab.icon;
        const button = (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) refs.current.set(tab.id, node);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={tabId(baseId, tab.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(baseId, tab.id)}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            className={cn(
              "inline-flex w-full flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
            onClick={() => onValueChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                focusSibling(tab.id, 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusSibling(tab.id, -1);
              }
            }}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
            {tab.label}
            {tab.badge ? (
              <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
        if (!tab.disabled || !tab.disabledHint) return button;
        // botão desabilitado não dispara eventos de mouse — o tooltip fica
        // num invólucro focável.
        return (
          <TooltipProvider key={tab.id} delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex flex-1 rounded-md">
                  {button}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{tab.disabledHint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export function tabId(baseId: string, tab: string): string {
  return `${baseId}-tab-${tab}`;
}

export function tabPanelId(baseId: string, tab: string): string {
  return `${baseId}-panel-${tab}`;
}
