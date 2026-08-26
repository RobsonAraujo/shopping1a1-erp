"use client";

import { useState } from "react";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import {
  DRE_STATIC_ROWS,
  dreMonthShortLabel,
  isColoredRow,
  isDetailRow,
  rowLabelClass,
  valueToneClass,
  type DreStaticRowId,
  type DreTableRow,
} from "@/lib/dre/dre-table-rows";
import { cn } from "@/lib/utils";

const MONTHS = [7, 8] as const;

const AMOUNTS: Record<DreStaticRowId, [number, number]> = {
  totalEntrada: [198400, 214800],
  revenueMl: [198400, 214800],
  totalCustoOperacional: [-152200, -164700],
  cancelledSalesMl: [0, 0],
  saleFeeMl: [-25200, -28120],
  partialReturnsMl: [0, 0],
  returnFeeMl: [0, 0],
  specialFeesMl: [0, 0],
  productCostErp: [-89200, -98400],
  taxErp: [0, 0],
  sellerShippingMl: [0, 0],
  fullShippingMl: [0, 0],
  fullStorageMl: [0, 0],
  fullNonComplianceMl: [0, 0],
  adsCost: [-8800, -10000],
  minhaPaginaMl: [0, 0],
  affiliateFeeMl: [0, 0],
  margemContribuicao: [46200, 50100],
  totalCustoFixo: [-9800, -9800],
  lucroOperacionalAntesInvestimentos: [36400, 40300],
  totalInvestimento: [-4200, -1880],
  lucroOperacional: [32200, 38420],
  totalSaidaNaoOperacional: [0, 0],
  totalEntradaNaoOperacional: [0, 0],
  resultadoLiquido: [32200, 38420],
};

const PERCENTS: Partial<Record<DreStaticRowId, [number, number]>> = {
  margemContribuicao: [23.29, 23.32],
  lucroOperacionalAntesInvestimentos: [18.35, 18.76],
  lucroOperacional: [16.23, 17.89],
};

type DisplayRow =
  | { key: string; source: DreTableRow; amounts: [number, number] }
  | {
      key: string;
      source: "manual";
      label: string;
      amounts: [number, number];
    };

function staticRow(id: DreStaticRowId): DisplayRow {
  const source = DRE_STATIC_ROWS.find((row) => row.id === id)!;
  return { key: id, source, amounts: AMOUNTS[id] };
}

const DISPLAY: DisplayRow[] = [
  staticRow("totalEntrada"),
  staticRow("totalCustoOperacional"),
  staticRow("saleFeeMl"),
  staticRow("productCostErp"),
  staticRow("adsCost"),
  staticRow("margemContribuicao"),
  staticRow("totalCustoFixo"),
  {
    key: "aluguel",
    source: "manual",
    label: "Aluguel Salão",
    amounts: [-9800, -9800],
  },
  staticRow("lucroOperacionalAntesInvestimentos"),
  staticRow("totalInvestimento"),
  {
    key: "software",
    source: "manual",
    label: "Software",
    amounts: [-4200, -1880],
  },
  staticRow("lucroOperacional"),
];

const CHART_ROWS: {
  key: DreStaticRowId;
  label: string;
  tone: "revenue" | "cost" | "profit";
}[] = [
  { key: "totalEntrada", label: "Receita", tone: "revenue" },
  { key: "saleFeeMl", label: "Tarifa ML", tone: "cost" },
  { key: "productCostErp", label: "Custo produto", tone: "cost" },
  { key: "adsCost", label: "ADS", tone: "cost" },
  { key: "margemContribuicao", label: "Margem de contribuição", tone: "profit" },
  { key: "lucroOperacional", label: "Lucro operacional", tone: "profit" },
];

function barToneClass(tone: "revenue" | "cost" | "profit") {
  if (tone === "revenue") return "bg-[#1b2d6f]";
  if (tone === "cost") return "bg-rose-400";
  return "bg-emerald-500";
}

function DreChart({ monthIndex }: { monthIndex: number }) {
  const revenue = Math.abs(AMOUNTS.totalEntrada[monthIndex]) || 1;

  return (
    <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Receita → lucro operacional
      </p>
      <div className="space-y-2.5">
        {CHART_ROWS.map((row) => {
          const amount = AMOUNTS[row.key][monthIndex];
          const width = Math.min(100, (Math.abs(amount) / revenue) * 100);
          return (
            <div key={row.key} className="flex items-center gap-3">
              <p className="w-28 shrink-0 truncate text-[11px] text-[var(--muted-foreground)] sm:w-36">
                {row.label}
              </p>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500 ease-out",
                    barToneClass(row.tone),
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
              <p
                className={cn(
                  "w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums sm:w-28",
                  valueToneClass(amount),
                )}
              >
                {formatFinancialMoney(amount)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DemoDre() {
  const [monthIndex, setMonthIndex] = useState(1);
  const month = MONTHS[monthIndex];

  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Demonstrativo
          </p>
          <p className="mt-0.5 text-sm font-semibold tracking-tight">
            {dreMonthShortLabel(month)} · demonstração
          </p>
        </div>
        <div className="inline-flex rounded-full bg-[var(--muted)] p-1">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              type="button"
              className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors",
                i === monthIndex
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              onClick={() => setMonthIndex(i)}
            >
              {dreMonthShortLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <DreChart monthIndex={monthIndex} />

      <div className="px-4 py-5 sm:px-5">
          {DISPLAY.map((row) => {
            if (row.source === "manual") {
              const amount = row.amounts[monthIndex];
              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-4 rounded-xl py-1.5 pl-5 hover:bg-[var(--muted)]/40"
                >
                  <p className="text-[13px] font-normal leading-snug text-[var(--muted-foreground)]">
                    {row.label}
                  </p>
                  <p
                    className={cn(
                      "whitespace-nowrap text-right text-[15px] font-medium tabular-nums",
                      valueToneClass(amount),
                    )}
                  >
                    {formatFinancialMoney(amount)}
                  </p>
                </div>
              );
            }

            const dreRow = row.source;
            if (dreRow.type !== "static") return null;
            const section = isColoredRow(dreRow);
            const detail = isDetailRow(dreRow);
            const amount = row.amounts[monthIndex];
            const percent = PERCENTS[dreRow.id]?.[monthIndex] ?? null;

            return (
              <div
                key={row.key}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-xl px-2 transition-colors hover:bg-[var(--muted)]/40",
                  section
                    ? "mt-4 border-t border-[var(--border)] pt-3"
                    : "py-1.5",
                  detail && "pl-5",
                )}
              >
                <p className={cn("min-w-0 flex-1 py-1", rowLabelClass(dreRow))}>
                  {dreRow.label}
                </p>
                <div className="flex shrink-0 flex-col items-end">
                  <p
                    className={cn(
                      "whitespace-nowrap text-right text-[15px] tabular-nums leading-tight",
                      section ? "font-semibold" : "font-medium",
                      valueToneClass(amount),
                    )}
                  >
                    {formatFinancialMoney(amount)}
                  </p>
                  {dreRow.showPercent && percent != null ? (
                    <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                      {formatFinancialPercent(percent)} da receita
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
