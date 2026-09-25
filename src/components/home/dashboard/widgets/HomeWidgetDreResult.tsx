"use client";

import { Sparkline } from "@/components/shared/Sparkline";
import {
  HomeWidgetCard,
  HomeWidgetEmpty,
  HomeWidgetMetric,
} from "@/components/home/dashboard/HomeWidgetCard";
import { useHomeWidgetSlice } from "@/components/home/dashboard/HomeDashboardProvider";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import { valueToneClass } from "@/lib/ui/tone";

const DEFINITION = getHomeWidgetDefinition("dre-resultado");

/**
 * Resultado do último mês **sincronizado** — não do mês corrente: no dia 1 o
 * mês atual ainda está vazio e o card apareceria zerado, parecendo defeito.
 */
export function HomeWidgetDreResult() {
  const { value, loading, error } = useHomeWidgetSlice("finance");
  if (!DEFINITION) return null;

  if (loading || error || !value) {
    return (
      <HomeWidgetCard definition={DEFINITION} pending={loading} error={error} />
    );
  }

  if (value.latestMonth === null) {
    return (
      <HomeWidgetCard definition={DEFINITION}>
        <HomeWidgetEmpty
          title="Nenhum mês sincronizado ainda"
          description="Sincronize um mês no DRE para ver faturamento, margem e lucro aqui."
          actionLabel="Abrir o DRE"
          actionHref="/dashboard/dre"
        />
      </HomeWidgetCard>
    );
  }

  return (
    <HomeWidgetCard definition={DEFINITION}>
      <HomeWidgetMetric
        value={formatFinancialMoney(value.totalEntrada)}
        label={`faturamento · ${value.latestMonthLabel} de ${value.year}`}
      />

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">
            Margem de contribuição
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {formatFinancialMoney(value.margemContribuicao)}
            {value.margemContribuicaoPercent != null ? (
              <span className="ml-1 font-normal text-[var(--muted-foreground)]">
                {formatFinancialPercent(value.margemContribuicaoPercent)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">
            Lucro operacional
          </dt>
          <dd
            className={`mt-0.5 text-sm font-semibold tabular-nums ${valueToneClass(value.lucroOperacional)}`}
          >
            {formatFinancialMoney(value.lucroOperacional)}
            {value.lucroOperacionalPercent != null ? (
              <span className="ml-1 font-normal text-[var(--muted-foreground)]">
                {formatFinancialPercent(value.lucroOperacionalPercent)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <Sparkline
          values={value.resultadoLiquidoSeries}
          highlightIndex={value.latestMonth - 1}
          tone="emerald"
          ariaLabel={`Resultado líquido mês a mês em ${value.year}`}
        />
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Resultado líquido em {value.year} · {value.monthsSyncedCount}/12 meses
          sincronizados
          {value.syncWarningCount > 0
            ? ` · ${value.syncWarningCount} aviso(s) de sincronização`
            : ""}
        </p>
      </div>
    </HomeWidgetCard>
  );
}
