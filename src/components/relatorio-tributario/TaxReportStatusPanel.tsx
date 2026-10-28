"use client";

import { CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserFeedback } from "@/components/ui/user-feedback";
import { reportsConfig } from "@/config/reports";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import {
  impostoOperacionalPercentualRelatorio,
  impostoOperacionalTotalRelatorio,
} from "@/lib/tax-report/imposto-operacional";
import type {
  TaxReportDreFollowUp,
  TaxReportPayload,
  TaxReportScreenStatus,
} from "@/lib/tax-report/types";

/** dd/mm no fuso do relatório — o texto também sai no HTML do servidor. */
export function formatTaxReportDay(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: reportsConfig.catalogCompetitionTimezone,
  }).format(new Date(iso));
}

/** Último dia do mês (dd/mm) a partir do primeiro instante do mês seguinte. */
function formatMonthLastDay(monthCloseIso: string): string {
  return formatTaxReportDay(
    new Date(Date.parse(monthCloseIso) - 1).toISOString(),
  );
}

/**
 * Imposto do mês e % médio ponderado pelo valor das vendas (imposto ÷
 * faturamento) — o mesmo número que o DRE aplica, produto a produto.
 */
export function TaxMonthKpi({ report }: { report: TaxReportPayload }) {
  const tax = impostoOperacionalTotalRelatorio(report);
  const percent = impostoOperacionalPercentualRelatorio(report);
  return (
    <div>
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        Imposto do mês
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-4 items-center justify-center rounded-full text-[var(--muted-foreground)] opacity-60 hover:opacity-100"
              aria-label="Como o imposto do mês é calculado"
            >
              <Info className="size-3" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-left">
            PIS/COFINS líquido + ICMS/DIFAL − créditos, somados venda a venda.
            O % é a média ponderada pelo valor de cada venda (imposto ÷
            faturamento). O DRE usa o % de cada produto deste relatório em
            Impostos sobre vendas.
          </TooltipContent>
        </Tooltip>
      </p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
        {formatFinancialMoney(tax)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {percent === null
          ? "Sem faturamento no período"
          : `${formatFinancialPercent(percent)} do faturamento`}
      </p>
    </div>
  );
}

/**
 * O que precisa de ação no relatório do mês: recálculo da tela diferente do
 * salvo (o salvo é o que o DRE usa), mês fechado com pedidos buscados antes do
 * fechamento, nivelamento alterado ou versão antiga do cálculo.
 */
export function TaxReportStatusBanner({
  status,
  report,
  monthLabel,
  busy,
  onRecompute,
  onRegenerate,
}: {
  status: TaxReportScreenStatus;
  report: TaxReportPayload;
  monthLabel: string;
  busy: boolean;
  /** Recalcular sobre as vendas salvas (sem ML). */
  onRecompute: () => void;
  /** Recalcular buscando os pedidos de novo no ML. */
  onRegenerate: () => void;
}) {
  const { staleness, saved } = status;

  if (staleness.reasons.includes("incomplete")) {
    const fetched = staleness.ordersFetchedAtIso
      ? formatTaxReportDay(staleness.ordersFetchedAtIso)
      : "antes do fechamento";
    return (
      <UserFeedback tone="warning" title="Relatório incompleto">
        <span className="block">
          Pedidos buscados em {fetched}, antes do fechamento do mês (
          {formatMonthLastDay(staleness.monthCloseIso)}) — faltam as vendas
          depois disso, e o imposto do DRE de {monthLabel} também.
        </span>
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={onRegenerate}
        >
          <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
          Recalcular
        </Button>
      </UserFeedback>
    );
  }

  if (status.unsavedRecalc) {
    const shownPercent = impostoOperacionalPercentualRelatorio(report);
    const savedPercent =
      saved.revenue > 0 ? (saved.tax / saved.revenue) * 100 : null;
    return (
      <UserFeedback tone="warning" title="Recálculo não salvo">
        <span className="block">
          Esta tela recalculou {monthLabel} com o cadastro e o nivelamento
          atuais: imposto {formatFinancialPercent(shownPercent)}. A versão
          salva — a que o DRE usa — tem {formatFinancialPercent(savedPercent)}.
        </span>
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={onRecompute}
        >
          Salvar recálculo
        </Button>
      </UserFeedback>
    );
  }

  const quick = staleness.reasons.filter(
    (reason) => reason === "leveling" || reason === "legacy",
  );
  if (quick.length > 0) {
    return (
      <UserFeedback tone="warning" title="Cálculo desatualizado">
        <span className="block">
          {quick.includes("leveling")
            ? "Um nivelamento de custo deste mês mudou depois do cálculo. "
            : ""}
          {quick.includes("legacy")
            ? "Calculado por uma versão antiga do relatório (linhas por texto de SKU). "
            : ""}
          Atualizar refaz o cálculo com as vendas já salvas, sem buscar nada no
          Mercado Livre.
        </span>
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={onRecompute}
        >
          Atualizar cálculo
        </Button>
      </UserFeedback>
    );
  }

  return null;
}

/** Se o DRE do mês usa esta versão — material de conferência, sem alarme. */
export function TaxReportDreLine({
  status,
  monthLabel,
  busy,
  onRefreshDre,
}: {
  status: TaxReportScreenStatus;
  monthLabel: string;
  busy: boolean;
  onRefreshDre: () => void;
}) {
  const { dre, staleness } = status;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
      {staleness.completeness === "partial" && staleness.ordersFetchedAtIso ? (
        <span>
          Mês em andamento — pedidos até{" "}
          {formatTaxReportDay(staleness.ordersFetchedAtIso)}.
        </span>
      ) : null}
      {dre === null ? null : dre.manualEdit ? (
        <span>
          DRE de {monthLabel}: Impostos sobre vendas ajustado à mão (
          {formatFinancialMoney(dre.taxErp)}) — não é atualizado sozinho.
        </span>
      ) : dre.usesThisVersion ? (
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
          DRE de {monthLabel} usa esta versão (
          {formatFinancialMoney(dre.taxErp)}).
        </span>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          DRE de {monthLabel} usa outra versão deste relatório.
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={onRefreshDre}
          >
            Atualizar imposto no DRE
          </Button>
        </span>
      )}
    </div>
  );
}

/** Texto do toast depois que o DRE acompanhou o recálculo do tributário. */
export function dreFollowUpMessage(
  followUp: TaxReportDreFollowUp | undefined,
  monthLabel: string,
): { tone: "success" | "info" | "warning"; text: string } | null {
  if (!followUp) return null;
  switch (followUp.status) {
    case "updated":
      return {
        tone: "success",
        text: `Imposto do DRE de ${monthLabel} atualizado: ${formatFinancialMoney(followUp.previousTaxErp)} → ${formatFinancialMoney(followUp.taxErp)}.`,
      };
    case "unchanged":
      return {
        tone: "info",
        text: `Imposto do DRE de ${monthLabel} conferido — não mudou.`,
      };
    case "manual_edit":
      return {
        tone: "info",
        text: `Impostos sobre vendas de ${monthLabel} está ajustado à mão no DRE e foi mantido.`,
      };
    case "needs_sync":
      return {
        tone: "warning",
        text: `O DRE de ${monthLabel} é de uma versão antiga: sincronize o mês no DRE para usar este relatório.`,
      };
    case "failed":
      return {
        tone: "warning",
        text: `Relatório salvo, mas não foi possível atualizar o imposto do DRE de ${monthLabel}. Use "Atualizar imposto" no DRE.`,
      };
    case "no_snapshot":
      return null;
  }
}
