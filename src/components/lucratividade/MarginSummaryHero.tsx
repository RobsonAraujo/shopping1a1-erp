"use client";

import type { ReactNode } from "react";
import { ChevronRight, FlaskConical, Info, Megaphone, Receipt } from "lucide-react";
import { PlanningInfoTrigger } from "@/components/shared/PlanningInfoTrigger";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import {
  MARGIN_EXCLUSION_LABEL,
  type MarginExclusionReason,
  type MarginSummary,
} from "@/lib/lucratividade/margin-summary";
import {
  LISTING_SEGMENT_LABEL,
  type ListingSegment,
} from "@/lib/lucratividade/listing-segment";
import { valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-0.5 text-xs text-[var(--muted-foreground)] tabular-nums">
      {children}
    </span>
  );
}

function plural(n: number, singular: string, pluralForm: string) {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : pluralForm}`;
}

const EXCLUSION_HELP: Record<MarginExclusionReason, string> = {
  missing_cost: "sem custo cadastrado em Meus produtos",
  missing_tax: "sem alíquota de imposto",
  kit_incomplete: "kit com componente sem cadastro",
  incomplete: "taxa ou frete não puderam ser consultados no ML",
};

const SEGMENT_TITLE_SUFFIX: Record<Exclude<ListingSegment, "all">, string> = {
  own: "só próprios",
  catalog: "só catálogo",
};

export type SegmentSummaries = {
  own: MarginSummary;
  catalog: MarginSummary;
};

/** Uma linha da faixa Próprios vs Catálogo — o clique aplica o recorte. */
function SegmentCompareButton({
  segment,
  summary,
  totalRevenue,
  weighted,
  loading,
  partial,
  onSelect,
}: {
  segment: Exclude<ListingSegment, "all">;
  summary: MarginSummary;
  /** Faturamento de Todos — base da fatia "x% do total". */
  totalRevenue: number;
  weighted: boolean;
  loading: boolean;
  partial: boolean;
  onSelect: (segment: ListingSegment) => void;
}) {
  const label = LISTING_SEGMENT_LABEL[segment];
  const empty = summary.totalCount === 0;
  const share =
    weighted && totalRevenue > 0
      ? Math.round((summary.totalRevenue / totalRevenue) * 100)
      : null;

  let primaryLine: string;
  if (empty) {
    primaryLine = loading
      ? "Calculando…"
      : weighted
        ? "Sem vendas no período"
        : "Nenhum anúncio ativo ou pausado";
  } else if (weighted) {
    primaryLine = `${formatFinancialMoney(summary.totalRevenue)} faturados${share !== null ? ` · ${share}% do total` : ""}`;
  } else {
    primaryLine = plural(summary.includedCount, "anúncio na média", "anúncios na média");
  }

  const details: string[] = [];
  if (!empty) {
    if (summary.contributionPercent === null) {
      details.push("nenhum com cadastro completo");
    } else if (weighted && summary.contributionValueTotal !== null) {
      details.push(`${formatFinancialMoney(summary.contributionValueTotal)} de margem`);
    }
    if (summary.afterAdsPercent !== null) {
      details.push(`após ADS ${formatFinancialPercent(summary.afterAdsPercent)}`);
    }
    if (summary.excluded.count > 0) {
      details.push(`${summary.excluded.count.toLocaleString("pt-BR")} fora da média`);
    }
  }

  return (
    <button
      type="button"
      disabled={empty}
      onClick={() => onSelect(segment)}
      aria-label={`Ver só anúncios: ${label}`}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--muted)]/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
        "disabled:cursor-default disabled:hover:bg-transparent",
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            empty && "text-[var(--muted-foreground)]",
          )}
        >
          {label}
        </p>
        <p className="text-xs tabular-nums text-[var(--muted-foreground)]">
          {primaryLine}
        </p>
        {details.length > 0 ? (
          <p className="text-xs tabular-nums text-[var(--muted-foreground)]">
            {details.join(" · ")}
          </p>
        ) : null}
      </div>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          valueToneClass(summary.contributionPercent),
          partial && "opacity-60",
        )}
      >
        {empty ? "—" : formatFinancialPercent(summary.contributionPercent)}
      </p>
      {empty ? (
        <span className="size-4 shrink-0" aria-hidden />
      ) : (
        <ChevronRight
          className="size-4 shrink-0 text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]"
          aria-hidden
        />
      )}
    </button>
  );
}

/**
 * Resumo da margem no topo da Lucratividade. No período a média é ponderada
 * pelo faturamento (margem real); na simulação é simples e vem rotulada como
 * tal. Anúncios incompletos aparecem como "fora da média" — o clique filtra a
 * tabela pra eles. `summary` já vem do recorte escolhido (Todos / Próprios /
 * Catálogo); em Todos, `segmentSummaries` mostra os dois lado a lado.
 */
export function MarginSummaryHero({
  summary,
  isSimulation,
  rangeLabel,
  loading,
  afterAdsUnavailableText,
  droppedListings,
  excludedFilterActive,
  onToggleExcludedFilter,
  segment,
  segmentSummaries,
  onSelectSegment,
}: {
  summary: MarginSummary;
  isSimulation: boolean;
  rangeLabel: string | null;
  loading: boolean;
  /** Motivo da margem após ADS não existir (ex.: período além de 90 dias). */
  afterAdsUnavailableText: string | null;
  droppedListings: { count: number; units: number; revenue: number } | null;
  excludedFilterActive: boolean;
  onToggleExcludedFilter: () => void;
  segment: ListingSegment;
  /** Só em Todos — margem de próprios e de catálogo em separado. */
  segmentSummaries: SegmentSummaries | null;
  onSelectSegment: (segment: ListingSegment) => void;
}) {
  const weighted = summary.mode === "weighted";
  const hasValue = summary.contributionPercent !== null;
  const partial = loading && summary.pendingCount > 0;
  const excludedReasons = (
    Object.entries(summary.excluded.byReason) as Array<[MarginExclusionReason, number]>
  ).filter(([, count]) => count > 0);
  const title = isSimulation
    ? "Margem simulada no preço de hoje"
    : "Margem de contribuição";

  return (
    <Card className="overflow-hidden p-0">
      <div
        className={cn(
          "grid gap-0",
          // período: 3 colunas só no lg; no md, Faturamento e Após ADS
          // dividem a segunda linha pra não espremer a margem.
          weighted
            ? "md:grid-cols-2 lg:grid-cols-[1fr_auto_auto]"
            : "md:grid-cols-[1fr_auto]",
        )}
      >
        <div className={cn("p-5", weighted && "md:col-span-2 lg:col-span-1")}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {segment === "all"
                ? title
                : `${title} · ${SEGMENT_TITLE_SUFFIX[segment]}`}
            </p>
            {isSimulation ? (
              <Badge variant="warning" className="gap-1">
                <FlaskConical className="size-3" aria-hidden />
                Simulação
              </Badge>
            ) : rangeLabel ? (
              <Badge variant="muted">{rangeLabel}</Badge>
            ) : null}
          </div>

          {hasValue ? (
            <p
              className={cn(
                "mt-1 text-4xl font-semibold tracking-tight tabular-nums",
                valueToneClass(summary.contributionPercent),
                partial && "opacity-60",
              )}
            >
              {formatFinancialPercent(summary.contributionPercent)}
            </p>
          ) : loading ? (
            <div
              className="mt-2 h-10 w-36 animate-pulse rounded-md bg-[var(--muted)]"
              aria-label="Calculando margem"
            />
          ) : (
            <p className="mt-1 text-4xl font-semibold tracking-tight text-[var(--muted-foreground)]">
              —
            </p>
          )}

          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            {weighted ? (
              summary.contributionValueTotal !== null ? (
                <>
                  <span className="font-medium text-[var(--foreground)] tabular-nums">
                    {formatFinancialMoney(summary.contributionValueTotal)}
                  </span>{" "}
                  de margem sobre{" "}
                  <span className="tabular-nums">
                    {formatFinancialMoney(summary.includedRevenue)}
                  </span>{" "}
                  faturados
                </>
              ) : loading ? (
                "Somando as vendas do período…"
              ) : (
                "Nenhuma venda com cadastro completo no período."
              )
            ) : (
              <>
                Média simples de{" "}
                {plural(summary.includedCount, "anúncio", "anúncios")} — cada
                um pesa igual, vendendo ou não
              </>
            )}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {weighted ? (
              <MetaChip>
                {plural(summary.includedUnits, "un. vendida", "un. vendidas")}
              </MetaChip>
            ) : null}
            <MetaChip>
              {plural(summary.includedCount, "anúncio na média", "anúncios na média")}
            </MetaChip>
            {partial ? (
              <MetaChip>
                Calculando {plural(summary.pendingCount, "anúncio", "anúncios")}…
              </MetaChip>
            ) : null}
            {summary.excluded.count > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md"
                    aria-pressed={excludedFilterActive}
                    onClick={onToggleExcludedFilter}
                  >
                    <Badge
                      variant="warning"
                      dot
                      className={cn(
                        "cursor-pointer",
                        excludedFilterActive && "ring-2 ring-amber-400/60",
                      )}
                    >
                      {plural(summary.excluded.count, "fora da média", "fora da média")}
                      {weighted && summary.excluded.revenue > 0
                        ? ` · ${formatFinancialMoney(summary.excluded.revenue)}`
                        : ""}
                    </Badge>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium">Não entram na média até serem completados:</p>
                  <ul className="mt-1 space-y-0.5">
                    {excludedReasons.map(([reason, count]) => (
                      <li key={reason}>
                        {MARGIN_EXCLUSION_LABEL[reason]} ({count}) —{" "}
                        {EXCLUSION_HELP[reason]}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 opacity-80">
                    {excludedFilterActive
                      ? "Clique para ver todos os anúncios."
                      : "Clique para ver só esses anúncios."}
                  </p>
                </TooltipContent>
              </Tooltip>
            ) : null}
            {droppedListings && droppedListings.count > 0 ? (
              <MetaChip>
                {plural(droppedListings.count, "anúncio removido", "anúncios removidos")} do ML
                ({formatFinancialMoney(droppedListings.revenue)} fora da conta)
              </MetaChip>
            ) : null}
          </div>
        </div>

        {weighted ? (
          <div className="flex flex-col gap-1 border-t border-[var(--border)] p-5 lg:min-w-[12rem] lg:border-t-0 lg:border-l">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              <Receipt className="size-3.5" aria-hidden />
              Faturamento
              <PlanningInfoTrigger
                className="h-5 w-5"
                content="Tudo o que foi vendido no período, inclusive os anúncios fora da média. A margem ao lado é calculada só sobre a parte com cadastro completo."
              />
            </p>
            {summary.totalCount > 0 ? (
              <>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    partial && "opacity-60",
                  )}
                >
                  {formatFinancialMoney(summary.totalRevenue)}
                </p>
                <p className="text-xs tabular-nums text-[var(--muted-foreground)]">
                  {plural(summary.totalUnits, "un. vendida", "un. vendidas")} ·{" "}
                  {plural(summary.totalCount, "anúncio", "anúncios")}
                </p>
              </>
            ) : loading ? (
              <div className="h-8 w-28 animate-pulse rounded-md bg-[var(--muted)]" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums text-[var(--muted-foreground)]">
                —
              </p>
            )}
          </div>
        ) : null}

        <div
          className={cn(
            "flex flex-col gap-1 border-t border-[var(--border)] bg-[var(--muted)]/25 p-5",
            weighted
              ? "md:border-l lg:min-w-[16rem] lg:border-t-0"
              : "md:min-w-[16rem] md:border-t-0 md:border-l",
          )}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            <Megaphone className="size-3.5" aria-hidden />
            Após ADS
          </p>
          {summary.afterAdsPercent !== null ? (
            <>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  valueToneClass(summary.afterAdsPercent),
                  partial && "opacity-60",
                )}
              >
                {formatFinancialPercent(summary.afterAdsPercent)}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {weighted && summary.afterAdsValueTotal !== null
                  ? `${formatFinancialMoney(summary.afterAdsValueTotal)} depois do gasto com Product Ads`
                  : "Margem de contribuição menos o TACOS de cada anúncio"}
              </p>
            </>
          ) : loading ? (
            <div className="h-8 w-24 animate-pulse rounded-md bg-[var(--muted)]" />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              {afterAdsUnavailableText ?? "Sem dados de Product Ads."}
            </p>
          )}
        </div>
      </div>

      {segment === "all" && segmentSummaries ? (
        <div
          role="group"
          aria-label="Margem por tipo de anúncio"
          className="grid divide-y divide-[var(--border)] border-t border-[var(--border)] md:grid-cols-2 md:divide-x md:divide-y-0"
        >
          {(["own", "catalog"] as const).map((key) => (
            <SegmentCompareButton
              key={key}
              segment={key}
              summary={segmentSummaries[key]}
              totalRevenue={summary.totalRevenue}
              weighted={weighted}
              loading={loading}
              partial={partial}
              onSelect={onSelectSegment}
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-start gap-2 border-t border-[var(--border)] px-5 py-2.5 text-xs text-[var(--muted-foreground)]">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          {isSimulation ? (
            <>
              <span className="font-medium text-[var(--foreground)]">
                Não é a margem real.
              </span>{" "}
              Considera todos os anúncios ativos e pausados no preço de hoje,
              com peso igual, inclusive os que não venderam. Use para ver o
              caminho da margem — o resultado real está nos períodos de venda.
            </>
          ) : (
            <>
              Média ponderada pelo faturamento: quem vende mais pesa mais.
              Margem = preço − taxa ML − frete − custo − impostos, com custos e
              impostos do cadastro atual.
            </>
          )}
        </p>
      </div>
    </Card>
  );
}
