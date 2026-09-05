"use client";

import { memo, useState } from "react";
import {
  AlertCircle,
  Landmark,
  Receipt,
  Rocket,
  TrendingUp,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import type { DreComputedTotals } from "@/lib/dre/dre-calculations";
import {
  DEFAULT_DRE_VISIBILITY,
  valueToneClass,
  type DreVisibilitySettings,
} from "@/lib/dre/dre-table-rows";
import { cn } from "@/lib/utils";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Caminho de uma fatia de rosca (donut) entre dois ângulos, em graus. */
function donutSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

/** Reduz a fonte do valor central do donut conforme o texto formatado cresce, pra nunca estourar o buraco. */
function pieCenterValueSizeClass(formatted: string): string {
  if (formatted.length > 14) return "text-[10px] sm:text-xs";
  if (formatted.length > 10) return "text-xs sm:text-sm";
  return "text-sm sm:text-base";
}

type DrePieDisplayMode = "both" | "percent" | "value";

const PIE_DISPLAY_OPTIONS: Array<{ value: DrePieDisplayMode; label: string }> = [
  { value: "both", label: "R$ e %" },
  { value: "percent", label: "Só %" },
  { value: "value", label: "Só R$" },
];

/**
 * Gráfico de rosca: Custos Variáveis, Custo Fixo, Investimentos e Lucro
 * Operacional como fatias — cada uma proporcional ao próprio valor absoluto
 * (não à Entrada), para funcionar mesmo em prejuízo. O centro mostra a
 * Entrada; a legenda ao lado tem um alternador pra ver só valor, só % (da
 * receita) ou os dois.
 */
export const DreRevenuePie = memo(function DreRevenuePie({
  totals,
  visibility = DEFAULT_DRE_VISIBILITY,
}: {
  totals: DreComputedTotals | null | undefined;
  visibility?: DreVisibilitySettings;
}) {
  const [mode, setMode] = useState<DrePieDisplayMode>("both");
  const base = totals?.totalEntrada ?? null;

  if (!totals || base == null || base <= 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
        Sem dados suficientes para o período.
      </div>
    );
  }

  const lucro = totals.lucroOperacional;
  const isLoss = lucro < 0;

  const rawItems = [
    {
      id: "totalCustoOperacional",
      label: "Custos Variáveis",
      value: totals.totalCustoOperacional,
      icon: Receipt,
      fillClass: "fill-rose-500",
      dotClass: "bg-rose-500",
    },
    {
      id: "totalCustoFixo",
      label: "Custo Fixo",
      value: totals.totalCustoFixo,
      icon: Landmark,
      fillClass: "fill-slate-400",
      dotClass: "bg-slate-400",
    },
    ...(visibility.showInvestments
      ? [
          {
            id: "totalInvestimento",
            label: "Investimentos",
            value: totals.totalInvestimento,
            icon: Rocket,
            fillClass: "fill-sky-400",
            dotClass: "bg-sky-400",
          },
        ]
      : []),
    {
      id: "lucroOperacional",
      label: "Lucro Operacional",
      value: lucro,
      icon: TrendingUp,
      fillClass: isLoss ? "fill-amber-500" : "fill-emerald-500",
      dotClass: isLoss ? "bg-amber-500" : "bg-emerald-500",
    },
  ];

  const weights = rawItems.map((item) => Math.abs(item.value));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

  const slices = rawItems.reduce<
    Array<
      (typeof rawItems)[number] & {
        percent: number;
        startAngle: number;
        endAngle: number;
        fraction: number;
      }
    >
  >((acc, item, index) => {
    const previousEnd = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
    const fraction = weights[index] / totalWeight;
    const startAngle = previousEnd;
    const endAngle = Math.min(360, startAngle + fraction * 360);
    acc.push({
      ...item,
      percent: (item.value / base) * 100,
      startAngle,
      endAngle: Math.min(endAngle, startAngle + 359.9),
      fraction,
    });
    return acc;
  }, []);

  const showValue = mode !== "percent";
  const showPercent = mode !== "value";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-[var(--muted-foreground)]">
          Visão geral do período
        </p>
        <div className="inline-flex rounded-full bg-[var(--muted)] p-1">
          {PIE_DISPLAY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                mode === option.value
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative shrink-0">
          <svg viewBox="0 0 200 200" className="size-44 sm:size-48" aria-hidden>
            {slices
              .filter((slice) => slice.fraction > 0)
              .map((slice) => (
                <Tooltip key={slice.id}>
                  <TooltipTrigger asChild>
                    <path
                      d={donutSlicePath(
                        100,
                        100,
                        94,
                        66,
                        slice.startAngle,
                        slice.endAngle,
                      )}
                      className={cn(
                        slice.fillClass,
                        "cursor-default transition-[filter] duration-150 hover:brightness-110",
                      )}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p className="font-semibold">{slice.label}</p>
                    <p className="mt-0.5 font-semibold tabular-nums">
                      {formatFinancialMoney(slice.value)} ·{" "}
                      {formatFinancialPercent(slice.percent)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
          </svg>
          <div
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 flex w-[62%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center overflow-hidden px-1",
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Entrada
            </p>
            <p
              className={cn(
                "w-full truncate text-center font-bold tabular-nums text-[var(--foreground)]",
                pieCenterValueSizeClass(formatFinancialMoney(base)),
              )}
            >
              {formatFinancialMoney(base)}
            </p>
          </div>
        </div>

        <div className="w-full flex-1 space-y-1">
          {slices.map((slice) => {
            const Icon = slice.icon;
            return (
              <div
                key={slice.id}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--muted)]/40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn("size-2.5 shrink-0 rounded-full", slice.dotClass)}
                    aria-hidden
                  />
                  <Icon
                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden
                  />
                  <span className="truncate text-sm text-[var(--foreground)]">
                    {slice.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-2">
                  {showValue ? (
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        valueToneClass(slice.value),
                      )}
                    >
                      {formatFinancialMoney(slice.value)}
                    </span>
                  ) : null}
                  {showPercent ? (
                    <span className="tabular-nums text-xs text-[var(--muted-foreground)]">
                      {formatFinancialPercent(slice.percent)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isLoss ? (
        <div className="mt-3 flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          Prejuízo operacional: {formatFinancialMoney(lucro)} (
          {formatFinancialPercent((lucro / base) * 100)})
        </div>
      ) : null}
    </div>
  );
});

export const WaterfallConnector = memo(function WaterfallConnector({
  operator,
}: {
  operator: "+" | "-" | "=";
}) {
  return (
    <div className="flex flex-col items-center justify-center py-1" aria-hidden>
      <div className="h-3 w-px bg-[var(--border)]" />
      <span
        className={cn(
          "-my-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold leading-none",
          operator === "="
            ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]"
            : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
        )}
      >
        {operator}
      </span>
      <div className="h-3 w-px bg-[var(--border)]" />
    </div>
  );
});
