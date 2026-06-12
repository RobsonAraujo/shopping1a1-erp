"use client";

import { NumericFormat } from "react-number-format";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import type { DreMonthView, DreYearView } from "@/lib/dre-year-data";
import {
  buildDreTableRows,
  getCellValue,
  rowBackgroundClass,
  valueToneClass,
  type DreTableRow,
} from "@/lib/dre-table-rows";
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
};

function formatSyncTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
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
    <Badge variant="outline" className="ml-2 px-1.5 py-0 text-[10px] font-normal">
      {label}
    </Badge>
  );
}

function DreMoneyInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  return (
    <NumericFormat
      key={`${value ?? "empty"}`}
      defaultValue={value ?? undefined}
      onBlur={(e) => {
        const raw = e.target.value
          .replace(/R\$\s?/g, "")
          .replace(/\./g, "")
          .replace(",", ".");
        const parsed = raw.trim() === "" ? null : Number(raw);
        if (parsed === null) {
          onCommit(null);
          return;
        }
        if (Number.isFinite(parsed) && parsed >= 0) {
          onCommit(parsed);
        }
      }}
      thousandSeparator="."
      decimalSeparator=","
      prefix="R$ "
      decimalScale={2}
      allowNegative={false}
      className="w-full min-w-[5.5rem] rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-right text-xs tabular-nums"
    />
  );
}

function renderLabelCell(row: DreTableRow) {
  const label =
    row.type === "fixed-cost" ? row.label : row.label;
  const source =
    row.type === "fixed-cost"
      ? row.source
      : row.type === "static"
        ? row.source
        : undefined;
  const indent = row.type === "fixed-cost" ? row.indent : row.indent;

  return (
    <div className={cn("flex min-w-[12rem] items-center", indent && "pl-4")}>
      <span
        className={cn(
          "text-sm",
          row.kind === "resultado" && "font-bold",
          (row.kind === "entrada-total" || row.kind === "custo-total") &&
            "font-semibold",
        )}
      >
        {label}
      </span>
      <SourceTag source={source} />
    </div>
  );
}

function renderValueCell(
  row: DreTableRow,
  month: DreMonthView,
  onFixedCostChange: DreYearTableProps["onFixedCostChange"],
) {
  if (row.type === "fixed-cost") {
    const stored = month.fixedCostValues[row.costItemId];
    return (
      <DreMoneyInput
        value={stored}
        onCommit={(amount) =>
          onFixedCostChange(row.costItemId, month.month, amount)
        }
      />
    );
  }

  const { amount, percent } = getCellValue(row, month);
  const showPercent = row.showPercent;

  return (
    <div className="text-right tabular-nums">
      <div
        className={cn(
          "text-sm",
          row.kind === "resultado" && "font-bold",
          (row.kind === "entrada-total" || row.kind === "custo-total") &&
            "font-semibold",
          row.kind === "resultado" ? valueToneClass(amount) : "",
        )}
      >
        {formatFinancialMoney(amount)}
      </div>
      {showPercent ? (
        <div className={cn("text-xs", valueToneClass(percent))}>
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

  const totals = data.yearTotals;
  if (!totals) return { amount: null, percent: null };

  switch (row.id) {
    case "totalEntrada":
      return { amount: totals.totalEntrada, percent: null };
    case "revenueMl":
      return {
        amount: data.months.reduce(
          (s, m) => s + (m.lines?.revenueMl ?? 0),
          0,
        ),
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
    case "lucroLiquido":
      return {
        amount: totals.lucroLiquido,
        percent: totals.lucroLiquidoPercent,
      };
    default:
      if (row.lineKey) {
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

export function DreYearTable({
  data,
  showDetails,
  syncingMonths,
  onSyncMonth,
  onFixedCostChange,
}: DreYearTableProps) {
  const rows = buildDreTableRows(data.costItems, showDetails);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[64rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]/40">
            <th className="sticky left-0 z-20 min-w-[14rem] bg-[var(--muted)]/95 px-3 py-3 text-left font-semibold backdrop-blur-sm">
              Linha
            </th>
            {data.months.map((month) => (
              <th
                key={month.month}
                className="min-w-[6.5rem] px-2 py-2 text-center align-bottom"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="font-semibold capitalize">{month.label}</span>
                  {month.isCurrentMonth ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Em andamento
                    </Badge>
                  ) : null}
                  {month.isPartial ? (
                    <Badge variant="warning" className="text-[10px]">
                      Parcial
                    </Badge>
                  ) : null}
                  {month.syncWarnings.length > 0 ? (
                    <Badge
                      variant="outline"
                      className="max-w-[6rem] truncate text-[10px]"
                      title={month.syncWarnings.join("\n")}
                    >
                      Avisos
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Sincronizar ${month.label}`}
                    disabled={syncingMonths.has(month.month)}
                    onClick={() => onSyncMonth(month.month)}
                  >
                    <RefreshCw
                      className={cn(
                        "size-3.5",
                        syncingMonths.has(month.month) && "animate-spin",
                      )}
                      aria-hidden
                    />
                  </Button>
                  <span className="text-[10px] font-normal text-[var(--muted-foreground)]">
                    {formatSyncTime(month.syncedAt)}
                  </span>
                </div>
              </th>
            ))}
            <th className="min-w-[6.5rem] px-2 py-3 text-center font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const kind = row.type === "fixed-cost" ? row.kind : row.kind;
            const bg = rowBackgroundClass(kind);
            const isResult = kind === "resultado";

            return (
              <tr
                key={row.type === "fixed-cost" ? row.id : row.id}
                className={cn(
                  "border-b border-[var(--border)]/60",
                  bg,
                  isResult && "border-t-2 border-t-[var(--border)]",
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 px-3 py-2",
                    bg,
                    "backdrop-blur-sm",
                  )}
                >
                  {renderLabelCell(row)}
                </td>
                {data.months.map((month) => (
                  <td key={month.month} className="px-2 py-2 align-middle">
                    {renderValueCell(row, month, onFixedCostChange)}
                  </td>
                ))}
                <td className="px-2 py-2 align-middle">
                  {row.type === "fixed-cost" ? (
                    <div className="text-right text-sm tabular-nums text-[var(--muted-foreground)]">
                      {formatFinancialMoney(
                        getYearTotalForRow(row, data).amount,
                      )}
                    </div>
                  ) : (
                    (() => {
                      const { amount, percent } = getYearTotalForRow(row, data);
                      return (
                        <div className="text-right tabular-nums">
                          <div
                            className={cn(
                              "text-sm font-semibold",
                              isResult ? valueToneClass(amount) : "",
                            )}
                          >
                            {formatFinancialMoney(amount)}
                          </div>
                          {row.type === "static" && row.showPercent ? (
                            <div
                              className={cn(
                                "text-xs",
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
  );
}
