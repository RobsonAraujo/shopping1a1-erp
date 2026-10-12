"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

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

/** Data curta (dd/mm/aaaa) de quando o mês foi conciliado. */
export function formatReconciledAt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Texto curto do status de conciliação (tooltip/aria das pílulas e cabeçalhos). */
export function reconciliationStatusLabel(month: DreMonthView): string {
  const { reconciliation } = month;
  if (reconciliation.status === "reconciled") {
    const when = formatReconciledAt(reconciliation.reconciledAt);
    return when ? `Conciliado em ${when}` : "Conciliado";
  }
  if (reconciliation.status === "review") {
    return "Conciliação salva para revisar";
  }
  return month.syncedAt ? "Não conciliado" : "Sem dados";
}

export function getMonthAlertMessages(month: DreMonthView): string[] {
  const messages: string[] = [];

  if (month.reconciliation.status === "review") {
    messages.push(
      "Conciliação salva para revisar — abra “Revisar conciliação” e concilie ou descarte.",
    );
  }
  if (month.levelingChangedAfterSync) {
    messages.push(
      "Nivelamento de custo alterado depois da última sincronização — sincronize o mês.",
    );
  }

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
        {month.syncedAt || month.reconciliation.status !== "none" ? (
          <p className="mt-1 text-[var(--muted-foreground)]">
            {reconciliationStatusLabel(month)}
          </p>
        ) : null}
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

/** Status de conciliação do mês selecionado (painel do mês, desktop e mobile). */
export function MonthReconciliationBadge({ month }: { month: DreMonthView }) {
  const status = month.reconciliation.status;
  if (status === "none" && !month.syncedAt) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        status === "reconciled" && "text-emerald-700",
        status === "review" && "text-amber-700",
      )}
      title={month.reconciliation.fileName ?? undefined}
    >
      {status === "reconciled" ? (
        <CheckCircle2 className="size-3.5" aria-hidden />
      ) : null}
      {reconciliationStatusLabel(month)}
    </span>
  );
}

/**
 * Atalho de conciliação do mês. Destaque (primário) quando o mês já tem dados
 * e ainda não está conciliado — é o próximo passo do fechamento.
 */
export function MonthReconcileButton({
  month,
  onReconcile,
  className,
}: {
  month: DreMonthView;
  onReconcile: (month: number) => void;
  className?: string;
}) {
  if (month.isFutureMonth) return null;
  const status = month.reconciliation.status;
  const label =
    status === "review"
      ? "Revisar conciliação"
      : status === "reconciled"
        ? "Reconciliar"
        : "Conciliar mês";
  const highlight = status === "review" || (status === "none" && Boolean(month.syncedAt));
  return (
    <Button
      type="button"
      size="sm"
      variant={highlight ? "default" : "outline"}
      className={cn("cursor-pointer gap-1.5", className)}
      onClick={() => onReconcile(month.month)}
    >
      <FileCheck2 className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
