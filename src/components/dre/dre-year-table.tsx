"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NumericFormat } from "react-number-format";
import { AlertCircle, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import type { DreMonthView, DreYearView } from "@/lib/dre/dre-year-data";
import {
  buildDreTableRows,
  dreMonthShortLabel,
  getCellValue,
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
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-amber-600 hover:bg-amber-50 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label={`Ver avisos de ${month.label}`}
        >
          <AlertCircle className="size-3" aria-hidden />
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

function SourceTag({ source }: { source?: string }) {
  if (!source) return null;
  const label =
    source === "ml"
      ? "ML"
      : source === "erp"
        ? "ERP"
        : source === "ads"
          ? "ADS"
          : "Manual";
  return (
    <Badge
      variant="outline"
      className="ml-1 px-1 py-0 text-[9px] font-normal leading-none"
    >
      {label}
    </Badge>
  );
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
        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-right text-[11px] tabular-nums"
      />
    );
  }

  const displayAmount = value === null ? null : -value;
  const inherited = override === null && value !== null;

  return (
    <div className="flex items-center justify-end gap-0">
      <span
        className={cn(
          "text-[11px] tabular-nums leading-tight",
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

  return (
    <div
      className={cn("flex min-w-0 items-center truncate", indent && "pl-2.5")}
      title={row.label}
    >
      <span className={cn(rowLabelClass(row), "truncate")}>{row.label}</span>
      <SourceTag source={source} />
    </div>
  );
}

function renderValueCell(
  row: DreTableRow,
  month: DreMonthView,
  onFixedCostChange: DreYearTableProps["onFixedCostChange"],
  onOperationalCostChange: DreYearTableProps["onOperationalCostChange"],
  onInvestmentCostChange: DreYearTableProps["onInvestmentCostChange"],
) {
  if (row.type === "fixed-cost") {
    const stored = month.fixedCostValues[row.costItemId];
    const override = month.fixedCostOverrides[row.costItemId];
    return (
      <DreManualCostCell
        value={stored}
        override={override}
        label={`${row.label} (${month.label})`}
        onCommit={(amount) =>
          onFixedCostChange(row.costItemId, month.month, amount)
        }
      />
    );
  }

  if (row.type === "operational-cost") {
    const stored = month.operationalCostValues[row.costItemId];
    const override = month.operationalCostOverrides[row.costItemId];
    return (
      <DreManualCostCell
        value={stored}
        override={override}
        label={`${row.label} (${month.label})`}
        onCommit={(amount) =>
          onOperationalCostChange(row.costItemId, month.month, amount)
        }
      />
    );
  }

  if (row.type === "investment-cost") {
    const stored = month.investmentCostValues[row.costItemId];
    const override = month.investmentCostOverrides[row.costItemId];
    return (
      <DreManualCostCell
        value={stored}
        override={override}
        label={`${row.label} (${month.label})`}
        onCommit={(amount) =>
          onInvestmentCostChange(row.costItemId, month.month, amount)
        }
      />
    );
  }

  const { amount, percent } = getCellValue(row, month);
  const showPercent = row.type === "static" && row.showPercent;

  const moneyLabel = formatFinancialMoney(amount);

  return (
    <div className="text-right tabular-nums leading-tight">
      <div
        className={cn(
          "truncate text-[11px]",
          row.type === "static" && row.kind === "resultado" && "font-bold",
          row.type === "static" &&
            (row.kind === "entrada-total" || row.kind === "custo-total") &&
            "font-semibold",
          row.type === "static" && row.kind === "resultado"
            ? valueToneClass(amount)
            : "",
        )}
        title={moneyLabel}
      >
        {moneyLabel}
      </div>
      {showPercent ? (
        <div className={cn("text-[10px]", valueToneClass(percent))}>
          {formatFinancialPercent(percent)}
        </div>
      ) : null}
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

function MonthHeaderCell({
  year,
  month,
  syncing,
  onSync,
}: {
  year: number;
  month: DreMonthView;
  syncing: boolean;
  onSync: () => void;
}) {
  const alertMessages = getMonthAlertMessages(month);
  const hasAlert = alertMessages.length > 0;

  return (
    <th
      className={cn(
        "border-b border-[var(--border)] bg-white px-0 py-1 text-center font-normal",
        month.isFutureMonth && "opacity-45",
      )}
    >
      <div className="flex items-center justify-center gap-0.5">
        <MonthSyncTooltip year={year} month={month}>
          <span
            className={cn(
              "cursor-default text-[10px] font-semibold tracking-wider text-[var(--muted-foreground)]",
              month.isCurrentMonth && "text-[var(--primary)]",
              !month.syncedAt && !month.isFutureMonth && "text-amber-700",
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
            className="size-5 shrink-0 p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label={`Sincronizar ${month.label}`}
            disabled={syncing}
            onClick={onSync}
          >
            <RefreshCw
              className={cn("size-3", syncing && "animate-spin")}
              aria-hidden
            />
          </Button>
        ) : null}
      </div>
    </th>
  );
}

export function DreYearTable({
  data,
  showDetails,
  syncingMonths,
  onSyncMonth,
  onFixedCostChange,
  onOperationalCostChange,
  onInvestmentCostChange,
}: DreYearTableProps) {
  const rows = buildDreTableRows(
    data.costItems,
    data.operationalCostItems,
    data.investmentCostItems,
    showDetails,
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col style={{ width: "13%" }} />
          {data.months.map((month) => (
            <col key={month.month} style={{ width: `${67 / 12}%` }} />
          ))}
          <col style={{ width: "7%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 z-20 border-b border-[var(--border)] bg-white px-2 py-1 text-left text-[10px] font-medium text-[var(--muted-foreground)]">
              Linha
            </th>
            {data.months.map((month) => (
              <MonthHeaderCell
                key={month.month}
                year={data.year}
                month={month}
                syncing={syncingMonths.has(month.month)}
                onSync={() => onSyncMonth(month.month)}
              />
            ))}
            <th className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-1 py-1 text-center text-[10px] font-semibold text-[var(--muted-foreground)]">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bg = rowBackgroundClass(row);
            const isResult = row.type === "static" && row.kind === "resultado";

            return (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-[var(--border)]/50",
                  bg,
                  isResult && "border-t border-t-[var(--border)]",
                )}
              >
                <td className={cn("sticky left-0 z-10 px-2 py-1", bg)}>
                  {renderLabelCell(row)}
                </td>
                {data.months.map((month) => (
                  <td key={month.month} className="px-0.5 py-1 align-middle">
                    {renderValueCell(
                      row,
                      month,
                      onFixedCostChange,
                      onOperationalCostChange,
                      onInvestmentCostChange,
                    )}
                  </td>
                ))}
                <td className="bg-[var(--muted)]/15 px-1 py-1 align-middle">
                  {row.type === "fixed-cost" ||
                  row.type === "operational-cost" ||
                  row.type === "investment-cost" ? (
                    <div className="text-right text-[11px] tabular-nums text-[var(--muted-foreground)]">
                      {formatFinancialMoney(
                        getYearTotalForRow(row, data).amount,
                      )}
                    </div>
                  ) : (
                    (() => {
                      const { amount, percent } = getYearTotalForRow(row, data);
                      return (
                        <div className="text-right tabular-nums leading-tight">
                          <div
                            className={cn(
                              "text-[11px] font-semibold",
                              isResult ? valueToneClass(amount) : "",
                            )}
                          >
                            {formatFinancialMoney(amount)}
                          </div>
                          {row.type === "static" && row.showPercent ? (
                            <div
                              className={cn(
                                "text-[10px]",
                                valueToneClass(percent),
                              )}
                            >
                              {formatFinancialPercent(percent)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
