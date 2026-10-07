"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { MousePointerClick, RefreshCw } from "lucide-react";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/shared/ItemListSearch";
import {
  ShowPausedListingsSwitch,
  countPausedListings,
  filterListingsByPausedVisibility,
} from "@/components/shared/ShowPausedListingsSwitch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TableSort } from "@/components/ui/sortable-th";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserFeedback } from "@/components/ui/user-feedback";
import { readApiError } from "@/lib/api/api-client-error";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  computeMarginSummary,
  marginExclusionReason,
} from "@/lib/lucratividade/margin-summary";
import {
  DEFAULT_LUCRATIVIDADE_VIEW,
  LUCRATIVIDADE_PERIOD_PRESETS,
  formatYmdRangeShort,
  resolvePeriodPreset,
  type LucratividadePeriodPreset,
  type LucratividadeView,
} from "@/lib/lucratividade/period-presets";
import type { LucratividadeTaxContext } from "@/lib/lucratividade/row-issues";
import {
  isRowBelowTarget,
  resolveTargetPriceCell,
} from "@/lib/lucratividade/target-margin";
import type { WholesaleReductionSettings } from "@/lib/pricing/wholesale-pricing";
import { STATUS_PILL_CLASS } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";
import { FinancialDetailSheet } from "@/components/lucratividade/detail-sheet/FinancialDetailSheet";
import { FinancialEvaluationTable } from "@/components/lucratividade/financial-evaluation-table";
import type { SortKey } from "@/components/lucratividade/financial-evaluation-table/types";
import { FinancialEvaluationTableSkeleton } from "@/components/lucratividade/FinancialEvaluationTableSkeleton";
import { MarginSummaryHero } from "@/components/lucratividade/MarginSummaryHero";
import { PeriodBar } from "@/components/lucratividade/PeriodBar";
import { TargetMarginPopover } from "@/components/lucratividade/TargetMarginPopover";
import {
  useEvaluationStream,
  type EvaluationRequest,
} from "@/components/lucratividade/hooks/useEvaluationStream";
import { useMinPriceOverlay } from "@/components/lucratividade/hooks/useMinPriceOverlay";
import { useTargetMargin } from "@/components/lucratividade/hooks/useTargetMargin";

type QuickFilter = "all" | "below" | "excluded";

/** Cor de cada filtro rápido — "Fora da média" no mesmo âmbar das flags dos
 * anúncios e do badge do topo; "Abaixo da meta" em vermelho (margem a
 * corrigir). Cor discreta: bolinha e contador coloridos, fundo só levemente
 * tingido; o hover só pinta a borda na cor do filtro; o ativo ganha borda e
 * texto na cor, sem preenchimento sólido. */
const QUICK_FILTER_TONE: Record<
  QuickFilter,
  { idle: string; active: string; dot: string; count: string }
> = {
  all: {
    idle: "border-[var(--border)] bg-[var(--primary)]/[0.03] text-[var(--foreground)] hover:border-[var(--primary)]/40",
    active: "border-[var(--primary)]/40 bg-[var(--primary)]/[0.08] text-[var(--primary)]",
    dot: "bg-[var(--primary)]",
    count: "bg-[var(--primary)]/10 text-[var(--primary)]",
  },
  below: {
    idle: "border-[var(--border)] bg-rose-500/[0.03] text-[var(--foreground)] hover:border-rose-300",
    active: "border-rose-300 bg-rose-500/[0.08] text-rose-700",
    dot: STATUS_PILL_CLASS.danger.dot,
    count: "bg-rose-500/10 text-rose-700",
  },
  excluded: {
    idle: "border-[var(--border)] bg-amber-500/[0.04] text-[var(--foreground)] hover:border-amber-300",
    active: "border-amber-300 bg-amber-500/[0.10] text-amber-800",
    dot: STATUS_PILL_CLASS.warning.dot,
    count: "bg-amber-500/15 text-amber-800",
  },
};

const subscribeNoop = () => () => {};

/** `false` no servidor e na hidratação, `true` depois — sem setState em effect. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

const PERIOD_LONG_LABEL: Record<LucratividadePeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7: "Últimos 7 dias",
  currentMonth: "Mês atual",
  last60: "Últimos 60 dias",
  last90: "Últimos 90 dias",
};

function isPeriodPreset(view: LucratividadeView): view is LucratividadePeriodPreset {
  return LUCRATIVIDADE_PERIOD_PRESETS.some((preset) => preset.id === view);
}

/** Valor de ordenação — `null` vai sempre pro fim. Fora da média não tem
 * margem confiável, então não disputa posição nas colunas de margem. */
function sortValue(row: FinancialEvaluationRow, key: SortKey): number | string | null {
  switch (key) {
    case "product":
      return (row.sku ?? row.title ?? row.mlItemId).toLowerCase();
    case "sales":
      return row.periodRevenue ?? 0;
    case "price":
      return row.pending ? null : row.salePrice;
    case "margin":
      return marginExclusionReason(row) ? null : (row.breakdown?.marginPercent ?? null);
    case "afterAds":
      return marginExclusionReason(row) || !row.adsMetricsAvailable
        ? null
        : row.marginAfterAdsPercent;
  }
}

function compareRows(
  a: FinancialEvaluationRow,
  b: FinancialEvaluationRow,
  sort: TableSort<SortKey>,
): number {
  const va = sortValue(a, sort.key);
  const vb = sortValue(b, sort.key);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  const dir = sort.direction === "asc" ? 1 : -1;
  if (typeof va === "string" || typeof vb === "string") {
    return dir * String(va).localeCompare(String(vb), "pt-BR");
  }
  return dir * (va - vb);
}

export function FinancialEvaluationClient({
  taxContext,
  initialWholesaleReductions,
}: {
  taxContext: LucratividadeTaxContext;
  initialWholesaleReductions: WholesaleReductionSettings;
}) {
  const [view, setView] = useState<LucratividadeView>(DEFAULT_LUCRATIVIDADE_VIEW);
  // Data de referência dos presets — só vale no client (a data do servidor
  // pode ser outra perto da meia-noite). "Recalcular" renova, pra "Hoje"
  // virar o dia.
  const hydrated = useHydrated();
  const [clientNow, setClientNow] = useState(() => new Date());
  const now = hydrated ? clientNow : null;
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPaused, setShowPaused] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState<TableSort<SortKey>>({
    key: "sales",
    direction: "desc",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wholesaleReductions, setWholesaleReductions] = useState(
    initialWholesaleReductions,
  );
  const { targetMarginPercent, marginBasis, applyTarget } = useTargetMargin();

  const isSimulation = view === "simulation";
  const range = useMemo(() => {
    if (!now || isSimulation) return null;
    if (view === "custom") return customRange;
    return isPeriodPreset(view) ? resolvePeriodPreset(view, now) : null;
  }, [now, view, customRange, isSimulation]);

  const request = useMemo<EvaluationRequest | null>(() => {
    if (!now) return null;
    if (isSimulation) return { kind: "simulation" };
    return range ? { kind: "period", from: range.from, to: range.to } : null;
  }, [now, isSimulation, range]);

  const stream = useEvaluationStream(request, reloadKey);
  const rows = stream.rows;
  const loading = request === null || stream.status === "loading";

  const summary = useMemo(
    () => computeMarginSummary(rows, { weighted: !isSimulation }),
    [rows, isSimulation],
  );

  const overlay = useMinPriceOverlay({
    rows,
    ready: stream.status === "done",
    simulation: isSimulation,
    targetMarginPercent,
    marginBasis,
    reloadKey,
  });

  const targetCellFor = useCallback(
    (row: FinancialEvaluationRow) =>
      resolveTargetPriceCell({
        row,
        patch: overlay.getPatch(row.mlItemId),
        refining: overlay.refiningIds.has(row.mlItemId),
        targetMarginPercent,
        marginBasis,
        rowIsLive: isSimulation,
      }),
    [overlay, targetMarginPercent, marginBasis, isSimulation],
  );

  const pausedCount = useMemo(
    () => countPausedListings(rows, (row) => row.status),
    [rows],
  );
  const belowTargetCount = useMemo(
    () =>
      rows.filter((row) => isRowBelowTarget(row, targetMarginPercent, marginBasis))
        .length,
    [rows, targetMarginPercent, marginBasis],
  );

  // "Vendas" não existe na simulação — cai pra ordem por produto.
  const effectiveSort = useMemo<TableSort<SortKey>>(
    () =>
      isSimulation && sort.key === "sales"
        ? { key: "product", direction: "asc" }
        : sort,
    [isSimulation, sort],
  );

  const visibleRows = useMemo(() => {
    const byStatus = filterListingsByPausedVisibility(
      rows,
      showPaused,
      (row) => row.status,
    );
    const bySearch = filterByItemListSearch(byStatus, searchQuery, (row) => ({
      sku: row.sku,
      title: row.title,
      mlItemId: row.mlItemId,
    }));
    const byQuick =
      quickFilter === "below"
        ? bySearch.filter((row) =>
            isRowBelowTarget(row, targetMarginPercent, marginBasis),
          )
        : quickFilter === "excluded"
          ? bySearch.filter((row) => !row.pending && marginExclusionReason(row) !== null)
          : bySearch;
    return [...byQuick].sort((a, b) => compareRows(a, b, effectiveSort));
  }, [
    rows,
    showPaused,
    searchQuery,
    quickFilter,
    targetMarginPercent,
    marginBasis,
    effectiveSort,
  ]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.mlItemId === selectedId) ?? null,
    [rows, selectedId],
  );

  const onSortChange = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "product" ? "asc" : "desc" },
    );
  }, []);

  const selectPreset = useCallback((preset: LucratividadePeriodPreset) => {
    setView(preset);
    setQuickFilter("all");
  }, []);

  const commitCustom = useCallback((from: string, to: string) => {
    setCustomRange({ from, to });
    setView("custom");
    setQuickFilter("all");
  }, []);

  const selectSimulation = useCallback(() => {
    setView("simulation");
    setQuickFilter("all");
  }, []);

  const reload = useCallback(() => {
    setClientNow(new Date());
    setReloadKey((key) => key + 1);
  }, []);

  const saveWholesaleReductions = useCallback(
    async (values: WholesaleReductionSettings) => {
      const res = await fetch("/api/company-tax-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wholesaleReductions: values }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "wholesale_settings_update_failed"));
      }
      const json = (await res.json()) as {
        wholesaleReductions: WholesaleReductionSettings;
      };
      setWholesaleReductions(json.wholesaleReductions);
    },
    [],
  );

  const rangeLabel = useMemo(() => {
    if (!range) return null;
    const dates = formatYmdRangeShort(range.from, range.to);
    return isPeriodPreset(view) ? `${PERIOD_LONG_LABEL[view]} · ${dates}` : dates;
  }, [range, view]);

  const statusText = useMemo(() => {
    if (stream.status === "loading" && request) {
      if (stream.meta) {
        const resolved = rows.filter((row) => !row.pending).length;
        return `Calculando margens… ${resolved.toLocaleString("pt-BR")} de ${stream.meta.listingCount.toLocaleString("pt-BR")} anúncios`;
      }
      if (stream.progress) {
        const { fetched, total } = stream.progress;
        return `Buscando vendas no Mercado Livre… ${fetched.toLocaleString("pt-BR")}${total !== null ? ` de ${total.toLocaleString("pt-BR")}` : ""} pedidos`;
      }
      return isSimulation
        ? "Buscando anúncios no Mercado Livre…"
        : "Buscando vendas no Mercado Livre…";
    }
    if (overlay.refining) return "Consultando o preço p/ meta no Mercado Livre…";
    return null;
  }, [stream.status, stream.meta, stream.progress, request, rows, isSimulation, overlay.refining]);

  const afterAdsUnavailableText =
    stream.meta?.adsUnavailableReason === "lookback_limit"
      ? "O Mercado Livre só guarda métricas de Product Ads dos últimos 90 dias."
      : stream.meta?.adsUnavailableReason === "api_error"
        ? "Métricas de Product Ads indisponíveis agora — tente Recalcular."
        : null;

  const showTable = rows.length > 0;
  const emptyDone = stream.status === "done" && rows.length === 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <PeriodBar
          view={view}
          range={range}
          customRange={customRange ?? range ?? { from: "", to: "" }}
          loading={loading}
          statusText={statusText}
          onSelectPreset={selectPreset}
          onCommitCustom={commitCustom}
          onSelectSimulation={selectSimulation}
          onReload={reload}
        />

        {taxContext.taxRegime === "SIMPLES" && !taxContext.simplesRateConfigured ? (
          <UserFeedback tone="warning" title="Alíquota do Simples não configurada">
            Sem ela, nenhum anúncio entra na média (o imposto ficaria zerado).{" "}
            <Link
              href="/dashboard/configuracoes/empresa"
              className="font-medium underline underline-offset-2"
            >
              Configurar em Configurações › Empresa
            </Link>
          </UserFeedback>
        ) : null}

        {stream.status === "error" ? (
          <UserFeedback title="Não foi possível carregar">
            <p>
              {stream.error}
              {rows.length > 0
                ? " Os anúncios que já carregaram continuam abaixo."
                : ""}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 gap-1.5"
              onClick={reload}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Tentar de novo
            </Button>
          </UserFeedback>
        ) : null}
        {stream.status === "interrupted" ? (
          <UserFeedback tone="warning" title="Carregamento interrompido">
            <p>
              O Mercado Livre demorou demais e a busca parou antes do fim — os
              números abaixo podem estar incompletos. Tente um período menor ou
              carregue de novo.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 gap-1.5"
              onClick={reload}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Carregar de novo
            </Button>
          </UserFeedback>
        ) : null}

        <MarginSummaryHero
          summary={summary}
          isSimulation={isSimulation}
          rangeLabel={rangeLabel}
          loading={loading}
          afterAdsUnavailableText={afterAdsUnavailableText}
          droppedListings={stream.meta?.droppedListings ?? null}
          excludedFilterActive={quickFilter === "excluded"}
          onToggleExcludedFilter={() =>
            setQuickFilter((prev) => (prev === "excluded" ? "all" : "excluded"))
          }
        />

        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-start gap-2">
            <ItemListSearch
              value={searchQuery}
              onChange={setSearchQuery}
              filteredCount={visibleRows.length}
              totalCount={rows.length}
              placeholder="Buscar por SKU, título ou MLB…"
              className="min-w-[220px] flex-1"
            />
            <ShowPausedListingsSwitch
              checked={showPaused}
              onCheckedChange={setShowPaused}
              pausedCount={pausedCount}
              className="h-11 sm:h-10"
            />
            <TargetMarginPopover
              targetMarginPercent={targetMarginPercent}
              marginBasis={marginBasis}
              onApply={applyTarget}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Filtrar anúncios"
              className="flex flex-wrap items-center gap-2"
            >
              {(
                [
                  { id: "all", label: "Todos", count: rows.length },
                  { id: "below", label: "Abaixo da meta", count: belowTargetCount },
                  {
                    id: "excluded",
                    label: "Fora da média",
                    count: summary.excluded.count,
                  },
                ] as const
              ).map((filter) => {
                const tone = QUICK_FILTER_TONE[filter.id];
                const active = quickFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setQuickFilter(filter.id)}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
                      active ? tone.active : tone.idle,
                    )}
                  >
                    <span className={cn("size-2 rounded-full", tone.dot)} aria-hidden />
                    {filter.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 font-semibold tabular-nums",
                        tone.count,
                      )}
                    >
                      {filter.count.toLocaleString("pt-BR")}
                    </span>
                  </button>
                );
              })}
            </div>
            {showTable && visibleRows.length > 0 ? (
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                <MousePointerClick className="size-3" aria-hidden />
                Clique em um anúncio para ver de onde vem a margem e o preço p/ meta.
              </p>
            ) : null}
          </div>

          {overlay.error ? (
            <UserFeedback tone="warning">{overlay.error}</UserFeedback>
          ) : null}

          {loading && !showTable ? <FinancialEvaluationTableSkeleton /> : null}

          {emptyDone ? (
            <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
              {isSimulation
                ? "Nenhum anúncio ativo ou pausado."
                : "Nenhuma venda paga neste período."}
            </p>
          ) : null}

          {showTable && visibleRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
              {searchQuery
                ? itemListSearchEmptyMessage(searchQuery)
                : quickFilter === "below"
                  ? "Nenhum anúncio abaixo da meta."
                  : quickFilter === "excluded"
                    ? "Todos os anúncios entram na média."
                    : "Nenhum anúncio para mostrar — os pausados estão ocultos."}
            </p>
          ) : null}

          {showTable && visibleRows.length > 0 ? (
            <FinancialEvaluationTable
              rows={visibleRows}
              sort={effectiveSort}
              onSortChange={onSortChange}
              onSortSet={setSort}
              isSimulation={isSimulation}
              targetMarginPercent={targetMarginPercent}
              marginBasis={marginBasis}
              targetCellFor={targetCellFor}
              onSelect={setSelectedId}
            />
          ) : null}
        </Card>

        {selectedRow ? (
          <FinancialDetailSheet
            row={selectedRow}
            isSimulation={isSimulation}
            periodLabel={rangeLabel}
            targetMarginPercent={targetMarginPercent}
            marginBasis={marginBasis}
            taxContext={taxContext}
            wholesaleReductions={wholesaleReductions}
            onSaveWholesaleReductions={saveWholesaleReductions}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
