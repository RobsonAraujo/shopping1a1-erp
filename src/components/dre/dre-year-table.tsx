"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NumericFormat } from "react-number-format";
import { AlertCircle, ChevronLeft, ChevronRight, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import { DreProductCostAuditModal } from "@/components/dre/dre-product-cost-audit-modal";
import { DreTaxAuditModal } from "@/components/dre/dre-tax-audit-modal";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import {
  getYearProductCostBreakdown,
  getYearTaxBreakdown,
} from "@/lib/dre/dre-calculations";
import {
  buildDreTableRows,
  dreMonthShortLabel,
  getCellValue,
  getRowMethodology,
  isColoredRow,
  rowBackgroundClass,
  rowLabelClass,
  valueToneClass,
  type DreTableRow,
} from "@/lib/dre/dre-table-rows";
import { reportsConfig } from "@/config/reports";
import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
} from "@/lib/mercadolibre/revenue-periods";
import { cn } from "@/lib/utils";

const PERCENT_ROW_DIVIDER_STYLE = {
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.3), inset 0 -1px 0 0 rgba(255,255,255,0.3)",
} as const;

/**
 * Border em <td> sticky dentro de tabela border-collapse não compõe de forma
 * confiável (bug de renderização do Chromium/Safari) — usamos box-shadow
 * inset por célula em vez de border no <tr>, aplicado a toda a linha para
 * manter o alinhamento entre a coluna sticky e as demais. Uma única variante
 * (linha inferior, translúcida) é usada em toda a tabela — sem uma borda
 * opaca especial antes das linhas de resultado, para não ficar inconsistente
 * ao lado das demais bordas translúcidas.
 */
const MAIN_ROW_DIVIDER_STYLE = {
  boxShadow: "inset 0 -1px 0 0 rgba(148, 163, 184, 0.35)",
} as const;

/** Zebra striping das linhas de detalhe (fundo branco/card) — só a cor #f4f2f7, sem borda extra. */
const ALT_ROW_BG = "#f4f2f7";

const SELECTED_MONTH_CELL_CLASS = "relative";

/**
 * Esmaece e desativa a interação das colunas que NÃO são a do mês
 * selecionado. `opacity` funciona de forma uniforme em cima de qualquer cor
 * de fundo (verde/vermelho/branco) — diferente do `box-shadow` inset escuro
 * que tentamos antes, que ficava inconsistente sobre as linhas já coloridas.
 * `pointer-events-none` também desliga os ícones/botões (sync, aviso, editar
 * valor manual) dessas colunas enquanto uma está em destaque.
 */
const DIM_CLASS =
  "pointer-events-none opacity-40 transition-opacity duration-150";

type DreYearTableProps = {
  data: DreYearView;
  showDetails: boolean;
  syncingMonths: Set<number>;
  onSyncMonth: (month: number) => void;
  onFixedCostChange: (
    costItemId: string,
    month: number,
    amount: number | null,
  ) => void;
  onOperationalCostChange: (
    costItemId: string,
    month: number,
    amount: number | null,
  ) => void;
  onInvestmentCostChange: (
    costItemId: string,
    month: number,
    amount: number | null,
  ) => void;
};

function formatSyncTime(iso: string | null): string {
  if (!iso) return "Nunca sincronizado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function getMonthAlertMessages(month: DreMonthView): string[] {
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

function MonthAlertsTooltip({
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

function MonthSyncTooltip({
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

function sourceOriginLabel(source: string): string {
  switch (source) {
    case "ml":
      return "Mercado Livre";
    case "erp":
      return "ERP (nosso sistema)";
    case "ads":
      return "Campanhas ADS (Mercado Livre)";
    default:
      return "Valor manual";
  }
}

function DreManualCostCell({
  value,
  override,
  label,
  onCommit,
}: {
  value: number | null;
  override: number | null;
  label: string;
  onCommit: (amount: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit(next: number | null) {
    setEditing(false);
    if (next !== value) {
      onCommit(next);
    }
  }

  if (editing) {
    return (
      <NumericFormat
        getInputRef={inputRef}
        value={draft ?? ""}
        onValueChange={(values) => {
          setDraft(values.floatValue ?? null);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
        }}
        thousandSeparator="."
        decimalSeparator=","
        prefix="R$ "
        decimalScale={2}
        allowNegative={false}
        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-right text-[12.5px] font-bold tabular-nums"
      />
    );
  }

  const displayAmount = value === null ? null : -value;
  const inherited = override === null && value !== null;

  return (
    <div className="flex items-center justify-end gap-0">
      <span
        className={cn(
          "whitespace-nowrap text-[12.5px] font-bold tabular-nums leading-tight",
          inherited && "text-[var(--muted-foreground)]",
        )}
        title={inherited ? "Valor herdado do mês anterior" : undefined}
      >
        {formatFinancialMoney(displayAmount)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-5 shrink-0 p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        aria-label={`Editar ${label}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <Pencil className="size-3" aria-hidden />
      </Button>
    </div>
  );
}

type AuditKind = "productCost" | "tax";
type AuditTarget = { kind: AuditKind; period: number | "year" } | null;

/** true quando algum mês do alvo de auditoria tem lançamentos mas não tem o detalhamento salvo (sincronizado antes desta funcionalidade). */
function auditTargetNeedsResync(data: DreYearView, target: AuditTarget): boolean {
  if (target === null) return false;
  const months =
    target.period === "year"
      ? data.months
      : data.months.filter((m) => m.month === target.period);
  return months.some((m) =>
    target.kind === "productCost"
      ? m.lines !== null && m.productCostBreakdown === null
      : m.lines !== null && m.taxBreakdown === null,
  );
}

/** Tooltip de auditoria: explica como o valor da célula foi calculado. */
function ValueMethodologyTooltip({
  text,
  children,
}: {
  text: string | undefined;
  children: ReactNode;
}) {
  if (!text) return <>{children}</>;

  return (
    <Tooltip delayDuration={2000}>
      <TooltipTrigger asChild>
        <div className="cursor-help">{children}</div>
      </TooltipTrigger>
      <TooltipContent side="left" align="center" className="max-w-[20rem] text-left">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function renderLabelCell(row: DreTableRow) {
  const source =
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost"
      ? row.source
      : row.type === "static"
        ? row.source
        : undefined;
  const indent =
    row.type === "fixed-cost" ||
    row.type === "operational-cost" ||
    row.type === "investment-cost" ||
    (row.type === "static" && row.indent);

  const labelSpan = <span className={rowLabelClass(row)}>{row.label}</span>;

  return (
    <div
      className={cn("flex min-w-0 items-start", indent && "pl-2.5")}
      title={source ? undefined : row.label}
    >
      {source ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help underline decoration-dotted decoration-1 underline-offset-2">
              {labelSpan}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" align="start">
            Fonte: {sourceOriginLabel(source)}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelSpan
      )}
    </div>
  );
}

function renderValueCell(
  row: DreTableRow,
  month: DreMonthView,
  onFixedCostChange: DreYearTableProps["onFixedCostChange"],
  onOperationalCostChange: DreYearTableProps["onOperationalCostChange"],
  onInvestmentCostChange: DreYearTableProps["onInvestmentCostChange"],
  onAuditClick?: (kind: AuditKind, month: number) => void,
) {
  if (row.type === "fixed-cost") {
    const stored = month.fixedCostValues[row.costItemId];
    const override = month.fixedCostOverrides[row.costItemId];
    return (
      <ValueMethodologyTooltip text={getRowMethodology(row)}>
        <DreManualCostCell
          value={stored}
          override={override}
          label={`${row.label} (${month.label})`}
          onCommit={(amount) =>
            onFixedCostChange(row.costItemId, month.month, amount)
          }
        />
      </ValueMethodologyTooltip>
    );
  }

  if (row.type === "operational-cost") {
    const stored = month.operationalCostValues[row.costItemId];
    const override = month.operationalCostOverrides[row.costItemId];
    return (
      <ValueMethodologyTooltip text={getRowMethodology(row)}>
        <DreManualCostCell
          value={stored}
          override={override}
          label={`${row.label} (${month.label})`}
          onCommit={(amount) =>
            onOperationalCostChange(row.costItemId, month.month, amount)
          }
        />
      </ValueMethodologyTooltip>
    );
  }

  if (row.type === "investment-cost") {
    const stored = month.investmentCostValues[row.costItemId];
    const override = month.investmentCostOverrides[row.costItemId];
    return (
      <ValueMethodologyTooltip text={getRowMethodology(row)}>
        <DreManualCostCell
          value={stored}
          override={override}
          label={`${row.label} (${month.label})`}
          onCommit={(amount) =>
            onInvestmentCostChange(row.costItemId, month.month, amount)
          }
        />
      </ValueMethodologyTooltip>
    );
  }

  const { amount } = getCellValue(row, month);
  const colored = isColoredRow(row);
  const methodology = getRowMethodology(row);

  const moneyLabel = formatFinancialMoney(amount);
  const valueClassName = cn(
    "whitespace-nowrap text-right text-[12.5px] font-bold tabular-nums leading-tight",
    colored ? "text-white" : "",
  );

  const auditKind: AuditKind | null =
    row.id === "productCostErp"
      ? "productCost"
      : row.id === "taxErp"
        ? "tax"
        : null;

  if (auditKind && onAuditClick) {
    return (
      <ValueMethodologyTooltip text={methodology}>
        <button
          type="button"
          onClick={() => onAuditClick(auditKind, month.month)}
          className={cn(
            valueClassName,
            "w-full cursor-pointer underline decoration-dotted decoration-1 underline-offset-2 hover:opacity-80",
          )}
        >
          {moneyLabel}
        </button>
      </ValueMethodologyTooltip>
    );
  }

  return (
    <ValueMethodologyTooltip text={methodology}>
      <div className={valueClassName}>{moneyLabel}</div>
    </ValueMethodologyTooltip>
  );
}

function renderPercentCell(percent: number | null, colored: boolean) {
  return (
    <div
      className={cn(
        "whitespace-nowrap text-right text-[12.5px] font-bold tabular-nums leading-tight",
        colored ? "text-white" : valueToneClass(percent),
      )}
    >
      {formatFinancialPercent(percent)}
    </div>
  );
}

function getYearTotalForRow(
  row: DreTableRow,
  data: DreYearView,
): { amount: number | null; percent: number | null } {
  if (row.type === "fixed-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.fixedCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? -sum : null, percent: null };
  }

  if (row.type === "operational-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.operationalCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? -sum : null, percent: null };
  }

  if (row.type === "investment-cost") {
    let sum = 0;
    let hasAny = false;
    for (const month of data.months) {
      const v = month.investmentCostValues[row.costItemId];
      if (v !== null && v !== undefined) {
        sum += v;
        hasAny = true;
      }
    }
    return { amount: hasAny ? -sum : null, percent: null };
  }

  const totals = data.yearTotals;
  if (!totals) return { amount: null, percent: null };

  switch (row.id) {
    case "totalEntrada":
      return { amount: totals.totalEntrada, percent: null };
    case "revenueMl":
      return {
        amount: data.months.reduce((s, m) => s + (m.lines?.revenueMl ?? 0), 0),
        percent: null,
      };
    case "totalCustoOperacional":
      return { amount: totals.totalCustoOperacional, percent: null };
    case "margemContribuicao":
      return {
        amount: totals.margemContribuicao,
        percent: totals.margemContribuicaoPercent,
      };
    case "totalCustoFixo":
      return { amount: totals.totalCustoFixo, percent: null };
    case "adsCost":
      return {
        amount: -totals.adsCost,
        percent: null,
      };
    case "lucroOperacionalAntesInvestimentos":
      return {
        amount: totals.lucroOperacionalAntesInvestimentos,
        percent: totals.lucroOperacionalAntesInvestimentosPercent,
      };
    case "totalInvestimento":
      return { amount: totals.totalInvestimento, percent: null };
    case "lucroOperacional":
      return {
        amount: totals.lucroOperacional,
        percent: totals.lucroOperacionalPercent,
      };
    default:
      if (row.type === "static" && row.lineKey) {
        const sum = data.months.reduce(
          (s, m) => s + (m.lines?.[row.lineKey!] ?? 0),
          0,
        );
        const hasData = data.months.some((m) => m.lines !== null);
        return { amount: hasData ? sum : null, percent: null };
      }
      return { amount: null, percent: null };
  }
}

/** Mobile: em vez de "mês" (índice em data.months), a seleção pode ser "total" (coluna Total do ano). */
type DreMobileSelection = number | "total";

function DreMobileRow({
  row,
  isAlt,
  selection,
  data,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
  onAuditClick,
}: {
  row: DreTableRow;
  isAlt: boolean;
  selection: DreMobileSelection;
  data: DreYearView;
  onFixedCostChange: DreYearTableProps["onFixedCostChange"];
  onOperationalCostChange: DreYearTableProps["onOperationalCostChange"];
  onInvestmentCostChange: DreYearTableProps["onInvestmentCostChange"];
  onAuditClick: (kind: AuditKind, period: number | "year") => void;
}) {
  const colored = isColoredRow(row);
  const bg = rowBackgroundClass(row);
  const showPercentRow = row.type === "static" && row.showPercent;
  const isTotal = selection === "total";
  const month = isTotal ? null : data.months[selection];
  const auditKind: AuditKind | null =
    row.type === "static"
      ? row.id === "productCostErp"
        ? "productCost"
        : row.id === "taxErp"
          ? "tax"
          : null
      : null;

  const valueNode = isTotal ? (
    <ValueMethodologyTooltip text={getRowMethodology(row)}>
      {auditKind ? (
        <button
          type="button"
          onClick={() => onAuditClick(auditKind, "year")}
          className={cn(
            "w-full cursor-pointer whitespace-nowrap text-right text-[13px] font-bold tabular-nums leading-tight underline decoration-dotted decoration-1 underline-offset-2 hover:opacity-80",
            colored ? "text-white" : "",
          )}
        >
          {formatFinancialMoney(getYearTotalForRow(row, data).amount)}
        </button>
      ) : (
        <div
          className={cn(
            "whitespace-nowrap text-right text-[13px] font-bold tabular-nums leading-tight",
            colored ? "text-white" : "",
          )}
        >
          {formatFinancialMoney(getYearTotalForRow(row, data).amount)}
        </div>
      )}
    </ValueMethodologyTooltip>
  ) : (
    renderValueCell(
      row,
      month!,
      onFixedCostChange,
      onOperationalCostChange,
      onInvestmentCostChange,
      (kind, m) => onAuditClick(kind, m),
    )
  );

  const percent = isTotal
    ? getYearTotalForRow(row, data).percent
    : getCellValue(row, month!).percent;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg px-3 py-2.5",
        colored ? bg : isAlt ? "bg-[var(--muted)]/25" : "bg-transparent",
      )}
    >
      <div className="min-w-0 flex-1">{renderLabelCell(row)}</div>
      <div className="shrink-0 text-right">
        {valueNode}
        {showPercentRow ? (
          <div className="mt-0.5">{renderPercentCell(percent, colored)}</div>
        ) : null}
      </div>
    </div>
  );
}

function DreYearTableMobile({
  data,
  showDetails,
  syncingMonths,
  onSyncMonth,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
}: DreYearTableProps) {
  const rows = useMemo(
    () =>
      buildDreTableRows(
        data.costItems,
        data.operationalCostItems,
        data.investmentCostItems,
        showDetails,
      ),
    [data.costItems, data.operationalCostItems, data.investmentCostItems, showDetails],
  );

  const altRowFlags = useMemo(() => {
    return rows.map((row, index) => {
      if (isColoredRow(row)) return false;
      const whiteRowsBefore = rows
        .slice(0, index)
        .filter((r) => !isColoredRow(r)).length;
      return whiteRowsBefore % 2 === 1;
    });
  }, [rows]);

  const defaultIndex = useMemo(() => {
    const currentIdx = data.months.findIndex((m) => m.isCurrentMonth);
    if (currentIdx >= 0) return currentIdx;
    return Math.max(0, data.months.length - 1);
  }, [data.months]);

  const [selection, setSelection] = useState<DreMobileSelection>(defaultIndex);
  const [auditTarget, setAuditTarget] = useState<AuditTarget>(null);

  const productCostAuditItems =
    auditTarget === null || auditTarget.kind !== "productCost"
      ? []
      : auditTarget.period === "year"
        ? getYearProductCostBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.productCostBreakdown ?? []);
  const taxAuditItems =
    auditTarget === null || auditTarget.kind !== "tax"
      ? []
      : auditTarget.period === "year"
        ? getYearTaxBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.taxBreakdown ?? []);
  const auditTitle =
    auditTarget === null
      ? ""
      : auditTarget.period === "year"
        ? `Ano ${data.year}`
        : (data.months.find((m) => m.month === auditTarget.period)?.label ??
          `Mês ${auditTarget.period}`);

  const selectedMonth = selection === "total" ? null : data.months[selection];
  const alertMessages = selectedMonth ? getMonthAlertMessages(selectedMonth) : [];

  const selectOptions = [
    ...data.months.map((month, index) => ({
      value: String(index),
      label: month.label,
    })),
    { value: "total", label: `Total ${data.year}` },
  ];

  function goToOffset(offset: number) {
    setSelection((prev) => {
      const base = prev === "total" ? data.months.length : prev;
      const next = base + offset;
      if (next < 0) return 0;
      if (next >= data.months.length) return "total";
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Período anterior"
          disabled={selection === 0}
          onClick={() => goToOffset(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <FormSelect
          value={String(selection)}
          onValueChange={(value) =>
            setSelection(value === "total" ? "total" : Number(value))
          }
          options={selectOptions}
          className="flex-1"
          triggerClassName="w-full"
          aria-label="Selecionar período"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Próximo período"
          disabled={selection === "total"}
          onClick={() => goToOffset(1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      {selectedMonth ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          <span>Sync: {formatSyncTime(selectedMonth.syncedAt)}</span>
          {alertMessages.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertCircle className="size-3.5" aria-hidden />
              {alertMessages.length} aviso{alertMessages.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {selectedMonth.canSync ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto gap-1.5"
              disabled={syncingMonths.has(selectedMonth.month)}
              onClick={() => onSyncMonth(selectedMonth.month)}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  syncingMonths.has(selectedMonth.month) && "animate-spin",
                )}
                aria-hidden
              />
              Sincronizar
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          Soma de todos os meses de {data.year}.
        </div>
      )}

      {alertMessages.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-900">
          {alertMessages.map((message) => (
            <li key={message}>• {message}</li>
          ))}
        </ul>
      ) : null}

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        {rows.map((row, index) => (
          <DreMobileRow
            key={row.id}
            row={row}
            isAlt={altRowFlags[index]}
            selection={selection}
            data={data}
            onFixedCostChange={onFixedCostChange}
            onOperationalCostChange={onOperationalCostChange}
            onInvestmentCostChange={onInvestmentCostChange}
            onAuditClick={(kind, period) => setAuditTarget({ kind, period })}
          />
        ))}
      </div>
      <DreProductCostAuditModal
        open={auditTarget !== null && auditTarget.kind === "productCost"}
        title={auditTitle}
        items={productCostAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
      <DreTaxAuditModal
        open={auditTarget !== null && auditTarget.kind === "tax"}
        title={auditTitle}
        items={taxAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
    </div>
  );
}

function MonthHeaderCell({
  year,
  month,
  syncing,
  selected,
  dimmed,
  onSync,
  onToggleSelect,
}: {
  year: number;
  month: DreMonthView;
  syncing: boolean;
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
          : "bg-white hover:bg-[var(--muted)]/40",
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
      <div className="flex items-center justify-center gap-0.5">
        <MonthSyncTooltip year={year} month={month}>
          <span
            className={cn(
              "cursor-pointer text-[12.5px] font-bold tracking-wider text-[var(--muted-foreground)]",
              month.isCurrentMonth && "text-[var(--primary)]",
              !month.syncedAt && !month.isFutureMonth && "text-amber-700",
              selected && "text-[var(--primary)]",
            )}
          >
            {dreMonthShortLabel(month.month)}
          </span>
        </MonthSyncTooltip>
        {hasAlert ? (
          <MonthAlertsTooltip month={month} messages={alertMessages} />
        ) : null}
        {month.canSync ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 rounded-sm border border-[var(--border)] p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label={`Sincronizar ${month.label}`}
            disabled={syncing}
            onClick={(e) => {
              e.stopPropagation();
              onSync();
            }}
          >
            <RefreshCw
              className={cn("size-3", syncing && "animate-spin")}
              aria-hidden
              // style={{ padding: 2 }}
            />
          </Button>
        ) : null}
      </div>
    </th>
  );
}

export function DreYearTable(props: DreYearTableProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DreYearTableMobile {...props} />;
  }
  return <DreYearTableDesktop {...props} />;
}

function DreYearTableDesktop({
  data,
  showDetails,
  syncingMonths,
  onSyncMonth,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
}: DreYearTableProps) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [auditTarget, setAuditTarget] = useState<AuditTarget>(null);

  const productCostAuditItems =
    auditTarget === null || auditTarget.kind !== "productCost"
      ? []
      : auditTarget.period === "year"
        ? getYearProductCostBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.productCostBreakdown ?? []);
  const taxAuditItems =
    auditTarget === null || auditTarget.kind !== "tax"
      ? []
      : auditTarget.period === "year"
        ? getYearTaxBreakdown(data.months)
        : (data.months.find((m) => m.month === auditTarget.period)
            ?.taxBreakdown ?? []);
  const auditTitle =
    auditTarget === null
      ? ""
      : auditTarget.period === "year"
        ? `Ano ${data.year}`
        : (data.months.find((m) => m.month === auditTarget.period)?.label ??
          `Mês ${auditTarget.period}`);

  const rows = buildDreTableRows(
    data.costItems,
    data.operationalCostItems,
    data.investmentCostItems,
    showDetails,
  );

  // Zebra striping só entre as linhas "brancas" (detalhe) — as linhas de
  // grupo/resultado (verde/vermelho) ficam de fora da contagem.
  const altRowFlags = rows.map((row, index) => {
    if (isColoredRow(row)) return false;
    const whiteRowsBefore = rows
      .slice(0, index)
      .filter((r) => !isColoredRow(r)).length;
    return whiteRowsBefore % 2 === 1;
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full min-w-[64rem] table-fixed border-collapse text-[12.5px]">
          <colgroup>
            <col style={{ width: "8%" }} />
            {data.months.map((month) => (
              <col key={month.month} style={{ width: `${84 / 12}%` }} />
            ))}
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead>
            <tr>
              <th
                className={cn(
                  "sticky left-0 z-20 border-b border-[var(--border)] bg-white px-3 py-2 text-left text-[12.5px] font-bold uppercase text-[var(--muted-foreground)]",
                  selectedMonth !== null && DIM_CLASS,
                )}
              >
                Linha
              </th>
              {data.months.map((month) => (
                <MonthHeaderCell
                  key={month.month}
                  year={data.year}
                  month={month}
                  syncing={syncingMonths.has(month.month)}
                  selected={selectedMonth === month.month}
                  dimmed={
                    selectedMonth !== null && selectedMonth !== month.month
                  }
                  onSync={() => onSyncMonth(month.month)}
                  onToggleSelect={() =>
                    setSelectedMonth((prev) =>
                      prev === month.month ? null : month.month,
                    )
                  }
                />
              ))}
              <th
                className={cn(
                  "border-b border-[var(--border)] bg-[var(--muted)]/30 px-2 py-2 text-center text-[12.5px] font-bold uppercase text-[var(--muted-foreground)]",
                  selectedMonth !== null && DIM_CLASS,
                )}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const bg = rowBackgroundClass(row);
              const showPercentRow = row.type === "static" && row.showPercent;
              const isAlt = altRowFlags[index];
              // Linhas com percentual logo abaixo não desenham borda inferior —
              // a separação já é feita pela borda da própria linha de percentual.
              const dividerStyle = showPercentRow
                ? undefined
                : MAIN_ROW_DIVIDER_STYLE;
              const rowClassName = isAlt ? undefined : bg;
              const cellStyle = isAlt
                ? { ...dividerStyle, backgroundColor: ALT_ROW_BG }
                : dividerStyle;

              return (
                <Fragment key={row.id}>
                  <tr className={rowClassName}>
                    <td
                      className={cn(
                        "sticky left-0 z-10 px-3 py-2",
                        rowClassName,
                        selectedMonth !== null && DIM_CLASS,
                      )}
                      style={cellStyle}
                    >
                      {renderLabelCell(row)}
                    </td>
                    {data.months.map((month) => (
                      <td
                        key={month.month}
                        className={cn(
                          "px-1.5 py-2 align-middle",
                          month.month === selectedMonth
                            ? cn(SELECTED_MONTH_CELL_CLASS, bg || "bg-white")
                            : selectedMonth !== null && DIM_CLASS,
                        )}
                        style={cellStyle}
                      >
                        {renderValueCell(
                          row,
                          month,
                          onFixedCostChange,
                          onOperationalCostChange,
                          onInvestmentCostChange,
                          (kind, m) => setAuditTarget({ kind, period: m }),
                        )}
                      </td>
                    ))}
                    <td
                      className={cn(
                        "px-2 py-2 align-middle",
                        rowClassName,
                        selectedMonth !== null && DIM_CLASS,
                      )}
                      style={cellStyle}
                    >
                      <ValueMethodologyTooltip text={getRowMethodology(row)}>
                        {row.type === "static" &&
                        (row.id === "productCostErp" ||
                          row.id === "taxErp") ? (
                          <button
                            type="button"
                            onClick={() =>
                              setAuditTarget({
                                kind:
                                  row.id === "productCostErp"
                                    ? "productCost"
                                    : "tax",
                                period: "year",
                              })
                            }
                            className={cn(
                              "w-full cursor-pointer whitespace-nowrap text-right text-[12.5px] font-bold tabular-nums leading-tight underline decoration-dotted decoration-1 underline-offset-2 hover:opacity-80",
                              isColoredRow(row) ? "text-white" : "",
                            )}
                          >
                            {formatFinancialMoney(
                              getYearTotalForRow(row, data).amount,
                            )}
                          </button>
                        ) : (
                          <div
                            className={cn(
                              "whitespace-nowrap text-right text-[12.5px] font-bold tabular-nums leading-tight",
                              isColoredRow(row) ? "text-white" : "",
                            )}
                          >
                            {formatFinancialMoney(
                              getYearTotalForRow(row, data).amount,
                            )}
                          </div>
                        )}
                      </ValueMethodologyTooltip>
                    </td>
                  </tr>
                  {showPercentRow ? (
                    <tr key={`${row.id}-percent`} className={bg}>
                      <td
                        className={cn(
                          "sticky left-0 z-10 px-3 py-1.5",
                          bg,
                          selectedMonth !== null && DIM_CLASS,
                        )}
                        style={PERCENT_ROW_DIVIDER_STYLE}
                      />
                      {data.months.map((month) => (
                        <td
                          key={month.month}
                          className={cn(
                            "px-1.5 py-1.5 align-middle",
                            month.month === selectedMonth
                              ? cn(SELECTED_MONTH_CELL_CLASS, bg)
                              : selectedMonth !== null && DIM_CLASS,
                          )}
                          style={PERCENT_ROW_DIVIDER_STYLE}
                        >
                          {renderPercentCell(
                            getCellValue(row, month).percent,
                            isColoredRow(row),
                          )}
                        </td>
                      ))}
                      <td
                        className={cn(
                          "px-2 py-1.5 align-middle",
                          bg,
                          selectedMonth !== null && DIM_CLASS,
                        )}
                        style={PERCENT_ROW_DIVIDER_STYLE}
                      >
                        {renderPercentCell(
                          getYearTotalForRow(row, data).percent,
                          isColoredRow(row),
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <DreProductCostAuditModal
        open={auditTarget !== null && auditTarget.kind === "productCost"}
        title={auditTitle}
        items={productCostAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
      <DreTaxAuditModal
        open={auditTarget !== null && auditTarget.kind === "tax"}
        title={auditTitle}
        items={taxAuditItems}
        needsResync={auditTargetNeedsResync(data, auditTarget)}
        onClose={() => setAuditTarget(null)}
      />
    </TooltipProvider>
  );
}
