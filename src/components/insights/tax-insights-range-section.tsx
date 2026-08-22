"use client";

import { useCallback, useMemo, useState } from "react";
import { Map, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { UserFeedback } from "@/components/ui/user-feedback";
import { InsightExpandableCard } from "@/components/insights/insight-expandable-card";
import { DifalMapCard } from "@/components/insights/difal-map-card";
import { ParetoCard } from "@/components/insights/pareto-card";
import { buildDifalMap } from "@/lib/insights/difal-map";
import { buildParetoRows, paretoConcentration } from "@/lib/insights/pareto";
import { lastDaysYmdRange, todayYmdLocal } from "@/lib/date-range";
import { readApiError } from "@/lib/api-client-error";
import type { TaxReportPayload } from "@/lib/tax-report/types";

type RangeMode = "month" | 7 | 15 | 30 | "custom";

function plural(n: number, singular: string, plural_: string) {
  return `${n} ${n === 1 ? singular : plural_}`;
}

function formatYmdBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function TaxInsightsRangeSection({
  initialPayload,
  taxPeriodLabel,
}: {
  initialPayload: TaxReportPayload;
  taxPeriodLabel: string;
}) {
  const [mode, setMode] = useState<RangeMode>("month");
  const [fromDate, setFromDate] = useState(todayYmdLocal);
  const [toDate, setToDate] = useState(todayYmdLocal);
  const [payload, setPayload] = useState<TaxReportPayload>(initialPayload);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/period-tax?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(await readApiError(res, "Falha ao carregar o período."));
      const data = (await res.json()) as TaxReportPayload;
      setPayload(data);
    } catch {
      setError("Não foi possível carregar o período selecionado.");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyPreset = useCallback(
    (days: 7 | 15 | 30) => {
      const { from, to } = lastDaysYmdRange(days);
      setMode(days);
      setFromDate(from);
      setToDate(to);
      void load(from, to);
    },
    [load],
  );

  const applyCustomRange = useCallback(
    (from: string, to: string) => {
      setMode("custom");
      setFromDate(from);
      setToDate(to);
      void load(from, to);
    },
    [load],
  );

  const backToMonth = useCallback(() => {
    setMode("month");
    setPayload(initialPayload);
    setError(null);
  }, [initialPayload]);

  const difalRows = useMemo(() => buildDifalMap(payload), [payload]);
  const paretoRows = useMemo(() => buildParetoRows(payload), [payload]);
  const { top3Percent, skusFor80Percent } = useMemo(
    () => (paretoRows.length > 0 ? paretoConcentration(paretoRows) : { top3Percent: 0, skusFor80Percent: 0 }),
    [paretoRows],
  );
  const worstDifalUf = difalRows.find((r) => r.margemMedia < 0);
  const highConcentration = top3Percent > 60;

  const periodLabel = mode === "month" ? taxPeriodLabel : `${formatYmdBr(fromDate)} – ${formatYmdBr(toDate)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "month" ? "default" : "outline"}
          onClick={backToMonth}
          disabled={loading}
        >
          {taxPeriodLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 7 ? "default" : "outline"}
          onClick={() => applyPreset(7)}
          disabled={loading}
        >
          Últimos 7 dias
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 15 ? "default" : "outline"}
          onClick={() => applyPreset(15)}
          disabled={loading}
        >
          Últimos 15 dias
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 30 ? "default" : "outline"}
          onClick={() => applyPreset(30)}
          disabled={loading}
        >
          Últimos 30 dias
        </Button>
        <DateRangePicker
          fromYmd={fromDate}
          toYmd={toDate}
          onChange={applyCustomRange}
          disabled={loading}
          maxDays={90}
        />
        {loading && (
          <span className="text-xs text-[var(--muted-foreground)]">Carregando…</span>
        )}
      </div>
      {error && (
        <UserFeedback title="Não foi possível carregar o período">
          {error}
        </UserFeedback>
      )}

      <InsightExpandableCard
        title="Margem por estado (DIFAL)"
        subtitle={`Impacto do DIFAL na margem por UF de destino — ${periodLabel}`}
        icon={<Map className="size-4" aria-hidden />}
        iconClassName="bg-blue-100 text-blue-700"
        accentClassName="border-l-blue-400"
        badge={
          worstDifalUf
            ? `${worstDifalUf.uf} negativo`
            : plural(difalRows.length, "estado", "estados")
        }
        badgeVariant={worstDifalUf ? "destructive" : "secondary"}
      >
        <DifalMapCard rows={difalRows} />
      </InsightExpandableCard>

      <InsightExpandableCard
        title="Concentração de receita (Pareto)"
        subtitle={`${periodLabel} — ${skusFor80Percent} SKU${skusFor80Percent !== 1 ? "s" : ""} respondem por 80% da receita`}
        icon={<PieChart className="size-4" aria-hidden />}
        iconClassName="bg-indigo-100 text-indigo-700"
        accentClassName="border-l-indigo-400"
        badge={
          highConcentration
            ? `top 3 = ${top3Percent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
            : plural(paretoRows.length, "SKU", "SKUs")
        }
        badgeVariant={highConcentration ? "warning" : "secondary"}
      >
        <ParetoCard rows={paretoRows} />
      </InsightExpandableCard>
    </div>
  );
}
