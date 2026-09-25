"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, Layers, TrendingUp, Wallet } from "lucide-react";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import { DreRevenuePie, WaterfallConnector } from "@/components/dre/DreRevenuePie";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DreComputedTotals } from "@/lib/dre/dre-calculations";
import { Sparkline, type SparklineTone } from "@/components/shared/Sparkline";
import { cn } from "@/lib/utils";

/**
 * Números ilustrativos de uma loja fictícia, com o mesmo gráfico de rosca e o
 * mesmo componente de conector "waterfall" usados de verdade no DRE do
 * painel (src/components/dre/DreRevenuePie.tsx), só com dados de demonstração.
 */
const DEMO_TOTALS: DreComputedTotals = {
  totalEntrada: 238000,
  totalCustoOperacional: -172000,
  margemContribuicao: 66000,
  margemContribuicaoPercent: 27.7,
  totalCustoFixoManual: 0,
  totalCustoOperacionalManual: 0,
  totalInvestimentoManual: 0,
  adsCost: 9000,
  totalCustoFixo: -18000,
  totalInvestimento: -9000,
  lucroOperacionalAntesInvestimentos: 48000,
  lucroOperacionalAntesInvestimentosPercent: 20.2,
  lucroOperacional: 39000,
  lucroOperacionalPercent: 16.4,
  totalSaidaNaoOperacionalManual: 0,
  totalSaidaNaoOperacional: 0,
  totalEntradaNaoOperacionalManual: 0,
  totalEntradaNaoOperacional: 0,
  resultadoLiquido: 39000,
  resultadoLiquidoPercent: 16.4,
};

const WATERFALL_ROWS: Array<{
  label: string;
  value: number;
  operator: "+" | "-" | "=";
  emphasis?: boolean;
}> = [
  { label: "Receita líquida", value: 238000, operator: "+" },
  { label: "Custos variáveis (tarifa ML, CMV, imposto)", value: -172000, operator: "-" },
  { label: "Custo fixo", value: -18000, operator: "-" },
  { label: "Investimento em ADS", value: -9000, operator: "-" },
  { label: "Resultado líquido do mês", value: 39000, operator: "=", emphasis: true },
];

function WaterfallCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  const positive = value >= 0;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
        emphasis
          ? "border-[var(--primary)]/30 bg-[var(--primary)]/5"
          : "border-[var(--border)] bg-[var(--card)]",
      )}
    >
      <span
        className={cn(
          "text-sm",
          emphasis ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          emphasis
            ? "text-lg font-bold text-emerald-600"
            : cn("text-sm font-semibold", positive ? "text-[var(--foreground)]" : "text-rose-600"),
        )}
      >
        {formatFinancialMoney(value)}
      </span>
    </div>
  );
}

type SparkTone = Extract<SparklineTone, "primary" | "sky" | "emerald">;

const ICON_TONE_CLASS: Record<SparkTone, string> = {
  primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

/** Mesma técnica do sparkline real do DRE (área + linha em SVG), com uma série fixa de 12 meses. */
function MiniKpiCard({
  icon,
  tone,
  label,
  value,
  hint,
  trendPercent,
  spark,
}: {
  icon: ReactNode;
  tone: SparkTone;
  label: string;
  value: string;
  hint?: string;
  trendPercent: number;
  spark: number[];
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", ICON_TONE_CLASS[tone])}>
          {icon}
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          {label}
        </p>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="text-[1.85rem] font-semibold leading-none tracking-tight tabular-nums text-[var(--foreground)]">
          {value}
        </p>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700">
          <ArrowUpRight className="size-3" aria-hidden />
          {trendPercent.toFixed(1)}%
        </span>
      </div>
      {hint ? <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">{hint}</p> : null}
      <div className="mt-4 -mb-1">
        <Sparkline
          values={spark}
          tone={tone}
          highlightIndex={spark.length - 1}
        />
      </div>
    </div>
  );
}

const REVENUE_SERIES = [162000, 166500, 171200, 168800, 179400, 186200, 182100, 198400, 214800, 205600, 221900, 238000];
const MARGIN_SERIES = [42800, 44200, 46600, 44100, 48900, 51200, 47300, 55200, 59500, 55800, 60700, 66000];
const PROFIT_SERIES = [22500, 24100, 26800, 23200, 28600, 31500, 26900, 33800, 37200, 32100, 36400, 39000];

function trendOf(series: number[]): number {
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  return ((last - prev) / Math.abs(prev)) * 100;
}

export function DemoDreCharts() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniKpiCard
          icon={<Wallet className="size-4" aria-hidden />}
          tone="primary"
          label="Faturamento"
          value={formatFinancialMoney(REVENUE_SERIES[REVENUE_SERIES.length - 1])}
          trendPercent={trendOf(REVENUE_SERIES)}
          spark={REVENUE_SERIES}
        />
        <MiniKpiCard
          icon={<Layers className="size-4" aria-hidden />}
          tone="sky"
          label="Margem de contribuição"
          value={formatFinancialMoney(MARGIN_SERIES[MARGIN_SERIES.length - 1])}
          hint="27,7% da receita"
          trendPercent={trendOf(MARGIN_SERIES)}
          spark={MARGIN_SERIES}
        />
        <MiniKpiCard
          icon={<TrendingUp className="size-4" aria-hidden />}
          tone="emerald"
          label="Lucro operacional"
          value={formatFinancialMoney(PROFIT_SERIES[PROFIT_SERIES.length - 1])}
          hint="16,4% da receita"
          trendPercent={trendOf(PROFIT_SERIES)}
          spark={PROFIT_SERIES}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <TooltipProvider delayDuration={200}>
          <DreRevenuePie totals={DEMO_TOTALS} />
        </TooltipProvider>
        <div className="space-y-0 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/20 p-4">
          <p className="mb-3 text-xs font-medium text-[var(--muted-foreground)]">
            Do faturamento ao resultado, em cascata
          </p>
          {WATERFALL_ROWS.map((row, index) => (
            <div key={row.label}>
              {index > 0 ? <WaterfallConnector operator={row.operator} /> : null}
              <WaterfallCard label={row.label} value={row.value} emphasis={row.emphasis} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
