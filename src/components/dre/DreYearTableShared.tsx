"use client";

import type { ReactNode } from "react";
import { CheckCircle2, FileCheck2, Info, RefreshCw } from "lucide-react";
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
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import { dreEditableLineLabel, dreMonthShortLabel } from "@/lib/dre/dre-table-rows";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
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

/**
 * Data curta (dd/mm/aaaa) de quando o mês foi conciliado.
 *
 * Fuso fixo de propósito: este texto vai no `title`/`aria-label` das pílulas,
 * que saem no HTML do servidor. Sem fuso, o servidor (UTC em produção) e o
 * navegador formatariam dias diferentes para uma conciliação feita à noite —
 * e o React não corrige atributo divergente na hidratação.
 */
export function formatReconciledAt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: reportsConfig.catalogCompetitionTimezone,
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

/** dd/mm no fuso do DRE (texto que também sai no HTML do servidor). */
function formatDayMonth(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: reportsConfig.catalogCompetitionTimezone,
  }).format(date);
}

/** Último dia do mês (dd/mm) — o mês fecha à 0h do dia 1º seguinte. */
function monthLastDay(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(lastDay).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

export type DreTaxAction = "refresh" | "recompute_report" | "regenerate_report" | "sync";

/**
 * Status do imposto do mês frente ao relatório tributário, em texto. `action`
 * = o que resolve (o resto é só informação). Mês fechado com o tributário
 * buscado antes do fechamento pede recalcular; buscado depois, está em dia.
 */
export function monthTaxStatusMessage(
  month: DreMonthView,
  year: number,
): { text: string; action: DreTaxAction | null; actionLabel?: string } | null {
  const status = month.taxStatus;
  if (!status) return null;
  const monthName = dreMonthShortLabel(month.month).toLowerCase();
  const reportRate =
    month.taxSource?.report && month.taxSource.report.revenue > 0
      ? (month.taxSource.report.tax / month.taxSource.report.revenue) * 100
      : null;

  switch (status.kind) {
    case "ok":
      return {
        text: `Imposto: tributário de ${formatDayMonth(status.report?.generatedAt ?? null)} ✓${
          reportRate !== null ? ` · ${formatFinancialPercent(reportRate)} no mês` : ""
        }`,
        action: null,
      };
    case "partial":
      return {
        text: `Imposto: tributário parcial (pedidos até ${formatDayMonth(status.report?.ordersFetchedAt ?? null)})`,
        action: null,
      };
    case "simples":
      return {
        text:
          month.taxSource?.simplesRatePercent != null
            ? `Imposto: alíquota do Simples (${formatFinancialPercent(month.taxSource.simplesRatePercent)})`
            : "Imposto: configure a alíquota efetiva do Simples em Configurações tributárias",
        action: null,
      };
    case "dre_outdated":
      return status.canRefresh
        ? {
            text: `Tributário de ${monthName} recalculado em ${formatDayMonth(status.report?.generatedAt ?? null)} — o imposto daqui usa a versão anterior.`,
            action: "refresh",
            actionLabel: "Atualizar imposto",
          }
        : {
            text: `Tributário de ${monthName} mudou — este mês foi sincronizado antes da auditoria por produto.`,
            action: "sync",
            actionLabel: "Sincronizar mês",
          };
    case "report_missing":
      return {
        text: `Sem relatório tributário de ${monthName} — o imposto ficou zerado ou com % de outro mês.`,
        action: "regenerate_report",
        actionLabel: "Gerar tributário",
      };
    case "report_outdated": {
      if (status.reasons.includes("incomplete")) {
        return {
          text: `Tributário de ${monthName} atualizado em ${formatDayMonth(status.report?.ordersFetchedAt ?? null)}, antes do fechamento do mês (${monthLastDay(year, month.month)}).`,
          action: "regenerate_report",
          actionLabel: "Recalcular tributário",
        };
      }
      const parts = [
        status.reasons.includes("leveling")
          ? "nivelamento alterado depois do cálculo"
          : null,
        status.reasons.includes("legacy") ? "calculado por uma versão antiga" : null,
      ].filter(Boolean);
      return {
        text: `Tributário de ${monthName}: ${parts.join(" e ")}.`,
        action: "recompute_report",
        actionLabel: "Atualizar cálculo",
      };
    }
  }
}

/**
 * Linha de status do imposto no painel do mês. O que pede ação ganha destaque
 * compacto (âmbar, com o botão que resolve); o resto é texto discreto.
 */
export function MonthTaxStatusLine({
  month,
  year,
  busy,
  onTaxAction,
}: {
  month: DreMonthView;
  year: number;
  busy: boolean;
  onTaxAction?: (month: number, action: DreTaxAction) => void;
}) {
  const message = monthTaxStatusMessage(month, year);
  if (!message) return null;
  if (!message.action) {
    return (
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {message.text}
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
      <span>{message.text}</span>
      {onTaxAction && message.actionLabel ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onTaxAction(month.month, message.action!)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold hover:bg-amber-200 disabled:cursor-default disabled:opacity-60"
        >
          {busy ? <RefreshCw className="size-3 animate-spin" aria-hidden /> : null}
          {message.actionLabel}
        </button>
      ) : null}
    </p>
  );
}

/** Linhas zeradas fora do padrão — ação (sincronizar de novo), em destaque compacto. */
export function MonthZeroAnomalyLine({
  month,
  busy,
  onResync,
}: {
  month: DreMonthView;
  busy: boolean;
  onResync?: (month: number) => void;
}) {
  if (month.zeroLineAnomalies.length === 0) return null;
  const labels = month.zeroLineAnomalies
    .map((anomaly) => dreEditableLineLabel(anomaly.lineKey))
    .join(", ");
  const typical = month.zeroLineAnomalies
    .map((anomaly) => `≈${formatFinancialPercent(anomaly.typicalPercent)}`)
    .join(", ");
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
      <span>
        {labels} veio zerada — fora do padrão dos outros meses ({typical}).
        Pode ser falha da API do Mercado Livre.
      </span>
      {onResync && month.canSync ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onResync(month.month)}
          className="cursor-pointer rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold hover:bg-amber-200 disabled:cursor-default disabled:opacity-60"
        >
          Sincronizar de novo
        </button>
      ) : null}
    </p>
  );
}

/**
 * Marca na própria célula: `action` (âmbar) quando a linha pede algo — imposto
 * fora do tributário, linha zerada fora do padrão; `muted` (cinza) quando é só
 * conferência — valor mantido do sync anterior.
 */
export function cellIssueFor(
  month: DreMonthView,
  lineKey: DreEditableLineKey,
  year: number,
): { tone: "action" | "muted"; text: string } | null {
  if (lineKey === "taxErp") {
    const message = monthTaxStatusMessage(month, year);
    if (message?.action) return { tone: "action", text: message.text };
  }
  const anomaly = month.zeroLineAnomalies.find((a) => a.lineKey === lineKey);
  if (anomaly) {
    return {
      tone: "action",
      text: `Veio zerada — nos outros meses fica em ≈${formatFinancialPercent(anomaly.typicalPercent)} do faturamento. Pode ser falha da API do ML: sincronize o mês de novo.`,
    };
  }
  if (month.keptFromPrevious?.lineKeys.includes(lineKey)) {
    return {
      tone: "muted",
      text: `A fonte não respondeu no último sync — valor mantido do sync de ${formatDayMonth(month.keptFromPrevious.syncedAt) || "antes"}.`,
    };
  }
  return null;
}

export function CellIssueMarker({
  tone,
  text,
}: {
  tone: "action" | "muted";
  text: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={text}
          className={cn(
            "inline-block size-1.5 shrink-0 rounded-full",
            tone === "action" ? "bg-amber-500" : "bg-[var(--muted-foreground)] opacity-50",
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** Nota de conferência para o modal de auditoria de uma linha do mês. */
export function lineAuditNote(
  month: DreMonthView | null,
  lineKey: DreEditableLineKey | null,
): string | null {
  if (!month || !lineKey) return null;
  if (month.keptFromPrevious?.lineKeys.includes(lineKey)) {
    return `A fonte não respondeu no último sync: valor e lista mantidos do sync de ${formatDayMonth(month.keptFromPrevious.syncedAt) || "antes"}.`;
  }
  const mismatch = month.lineAuditMismatches.find((m) => m.lineKey === lineKey);
  if (!mismatch) return null;
  if (mismatch.kind === "zero_with_audit") {
    return `A linha ficou zerada, mas esta lista soma ${formatFinancialMoney(mismatch.auditSum)} — sincronize o mês de novo.`;
  }
  return `A lista soma ${formatFinancialMoney(mismatch.auditSum)} e a linha mostra ${formatFinancialMoney(mismatch.value)}: o valor vem do resumo da fatura do ML, e a lista é o detalhamento que a fatura trouxe.`;
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
  if (month.keptFromPrevious) {
    messages.push(
      `Fonte indisponível no último sync: ${month.keptFromPrevious.lineKeys
        .map((key) => dreEditableLineLabel(key))
        .join(", ")} mantiveram o valor do sync de ${formatDayMonth(month.keptFromPrevious.syncedAt) || "antes"}.`,
    );
  }
  for (const mismatch of month.lineAuditMismatches) {
    if (month.keptFromPrevious?.lineKeys.includes(mismatch.lineKey)) continue;
    messages.push(
      `${dreEditableLineLabel(mismatch.lineKey)}: a linha mostra ${formatFinancialMoney(mismatch.value)} e a auditoria soma ${formatFinancialMoney(mismatch.auditSum)}.`,
    );
  }
  messages.push(...month.syncWarnings);

  return messages;
}

/**
 * Avisos do mês sob demanda — material de auditoria, não alarme: ícone de
 * informação cinza e apagado, que só ganha contraste no hover/foco. O que pede
 * ação (conciliação a revisar) já tem destaque próprio nas pílulas e no botão
 * do mês.
 */
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
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] opacity-50 hover:text-[var(--foreground)] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          aria-label={`Ver avisos de ${month.label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="size-3" aria-hidden />
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
