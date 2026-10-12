"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dreMonthShortLabel } from "@/lib/dre/dre-table-rows";
import type { DreMonthView } from "@/lib/dre/dre-year-data";
import { cn } from "@/lib/utils";
import {
  DIM_CLASS,
  getMonthAlertMessages,
  MonthAlertsTooltip,
  MonthSyncTooltip,
  reconciliationStatusLabel,
} from "@/components/dre/DreYearTableShared";

export function DreMonthHeaderCell({
  year,
  month,
  syncing,
  syncMessage,
  selected,
  dimmed,
  onSync,
  onToggleSelect,
}: {
  year: number;
  month: DreMonthView;
  syncing: boolean;
  syncMessage?: string;
  selected: boolean;
  dimmed: boolean;
  onSync: () => void;
  onToggleSelect: () => void;
}) {
  const alertMessages = getMonthAlertMessages(month);
  const hasAlert = alertMessages.length > 0;

  return (
    <th
      className={cn(
        "relative cursor-pointer border-b border-[var(--border)] px-1 py-2 text-center font-normal transition-colors",
        selected
          ? "bg-[var(--primary)]/10"
          : "bg-[var(--card)] hover:bg-[var(--muted)]/50",
        month.isFutureMonth && "opacity-45",
        dimmed && DIM_CLASS,
      )}
      onClick={onToggleSelect}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Destacar coluna de ${month.label}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
    >
      {/* Coluna estreita (12 meses em ~7% cada): rótulo + ✓ são um bloco que
          nunca quebra, e info + sync outro bloco — se faltar espaço, desce o
          bloco de ações inteiro, nunca o ✓ sozinho. */}
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        <MonthSyncTooltip year={year} month={month}>
          <span
            className={cn(
              "inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold tracking-wide text-[var(--muted-foreground)]",
              month.isCurrentMonth && "text-[var(--primary)]",
              !month.syncedAt && !month.isFutureMonth && "text-amber-700",
              selected && "text-[var(--primary)]",
            )}
          >
            {dreMonthShortLabel(month.month)}
            {month.reconciliation.status === "reconciled" ? (
              <>
                <CheckCircle2
                  className="size-3 shrink-0 text-emerald-600"
                  aria-hidden
                />
                <span className="sr-only">
                  {` — ${reconciliationStatusLabel(month)}`}
                </span>
              </>
            ) : null}
          </span>
        </MonthSyncTooltip>
        {hasAlert || month.canSync ? (
          <span className="inline-flex items-center gap-0.5">
            {hasAlert ? (
              <MonthAlertsTooltip month={month} messages={alertMessages} />
            ) : null}
            {month.canSync ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-5 shrink-0 rounded-sm border border-[var(--border)] p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label={
                  syncing
                    ? `Sincronizando ${month.label}: ${syncMessage ?? "em andamento"}`
                    : `Sincronizar ${month.label}`
                }
                title={
                  syncing
                    ? (syncMessage ?? "Sincronizando…")
                    : `Sincronizar ${month.label}`
                }
                disabled={syncing}
                onClick={(e) => {
                  e.stopPropagation();
                  onSync();
                }}
              >
                <RefreshCw
                  className={cn("size-3", syncing && "animate-spin")}
                  aria-hidden
                />
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </th>
  );
}
