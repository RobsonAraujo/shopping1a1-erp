"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { reportsConfig } from "@/config/reports";
import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
} from "@/lib/mercadolibre/revenue-periods";
import type { DreMonthView } from "@/lib/dre/dre-year-data";

/**
 * Esmaece e desativa a interação das células que não estão em foco.
 * Usado ao destacar uma coluna de mês, e também na edição inline
 * (quando tudo fica esmaecido exceto a célula sendo editada).
 * `opacity` funciona de forma uniforme em cima de qualquer cor de fundo
 * (verde/vermelho/branco). `pointer-events-none` desliga ícones/botões
 * das áreas esmaecidas.
 */
export const DIM_CLASS =
  "pointer-events-none opacity-40 transition-opacity duration-150";

export function formatSyncTime(iso: string | null): string {
  if (!iso) return "Nunca sincronizado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function getMonthAlertMessages(month: DreMonthView): string[] {
  const messages: string[] = [];

  if (month.isPartial) {
    messages.push(
      "Período parcial — mês em andamento ou custos ML ainda incompletos.",
    );
  }
  if (month.billingSource === "fallback" && month.syncedAt) {
    messages.push(
      "Custos ML estimados pelos pedidos (faturamento oficial indisponível ou incompleto).",
    );
  }
  messages.push(...month.syncWarnings);

  return messages;
}

export function MonthAlertsTooltip({
  month,
  messages,
}: {
  month: DreMonthView;
  messages: string[];
}) {
  if (messages.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full p-1 text-amber-500/70 opacity-60 hover:opacity-100 hover:text-amber-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          aria-label={`Ver avisos de ${month.label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <AlertCircle className="size-2.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="center"
        className="max-w-[18rem] space-y-2 text-left"
      >
        <p className="font-semibold text-[var(--foreground)]">
          Avisos — {month.label}
        </p>
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
        <p className="border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted-foreground)]">
          Última sync: {formatSyncTime(month.syncedAt)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function MonthSyncTooltip({
  year,
  month,
  children,
}: {
  year: number;
  month: DreMonthView;
  children: ReactNode;
}) {
  const civilRange = getCalendarMonthRange(
    year,
    month.month,
    reportsConfig.catalogCompetitionTimezone,
  );
  const civilPeriod = formatCalendarRangeYmd(
    civilRange,
    reportsConfig.catalogCompetitionTimezone,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="text-left">
        <p className="font-medium">{month.label}</p>
        <p className="mt-1 text-[var(--muted-foreground)]">
          Período civil: {civilPeriod.from} → {civilPeriod.to}
        </p>
        <p className="mt-1 text-[var(--muted-foreground)]">
          Sync: {formatSyncTime(month.syncedAt)}
        </p>
        {month.isCurrentMonth ? (
          <p className="mt-1 text-[var(--muted-foreground)]">Mês atual</p>
        ) : null}
        {month.isFutureMonth ? (
          <p className="mt-1 text-[var(--muted-foreground)]">Mês futuro</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
