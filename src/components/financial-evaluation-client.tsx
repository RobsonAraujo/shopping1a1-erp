"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calculator,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/listing-status-badge";
import {
  ShowPausedListingsSwitch,
  countPausedListings,
  filterListingsByPausedVisibility,
} from "@/components/show-paused-listings-switch";
import {
  MaskedMoneyField,
  MaskedPercentField,
} from "@/components/financial-cost-input-fields";
import { PlanningInfoTrigger } from "@/components/planning-info-trigger";
import {
  computeFinancialMargin,
  computeMarginAfterAds,
  computeMinSalePriceForTargetMargin,
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
  type MarginBasis,
  type MinSalePriceResult,
} from "@/lib/financial-margin";
import { readApiError } from "@/lib/api-client-error";
import { lastDaysYmdRange, todayYmdLocal } from "@/lib/date-range";
import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";
import { filterByItemListSearch } from "@/lib/item-list-search";
import {
  computeWholesalePricesForListing,
  displayMinPurchaseUnitForLevel,
  isWholesaleAnchorLevel,
  mlDiscountMinPurchaseUnitForLevel,
  wholesaleReductionsToTuple,
  type WholesalePriceLevelReason,
  type WholesaleReductionSettings,
} from "@/lib/wholesale-pricing";
import { WholesaleReductionSettingsCard } from "@/components/wholesale-reduction-settings-card";
import { cn } from "@/lib/utils";

type EvaluationMode = "current" | "period";

type ApiResponse = {
  items: FinancialEvaluationRow[];
  wholesaleReductions: WholesaleReductionSettings;
  mode?: EvaluationMode;
  from?: string;
  to?: string;
  salesCount?: number;
  periodDays?: number;
};

type SortKey = "product" | "price" | "margin" | "afterAds";
type SortDir = "asc" | "desc";

const TARGET_MARGIN_STORAGE_KEY = "lucratividade-target-margin";
const MARGIN_BASIS_STORAGE_KEY = "lucratividade-margin-basis";
const DEFAULT_TARGET_MARGIN_PERCENT = 6;

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: SortDir,
): number {
  const aNull = a === null || a === undefined || !Number.isFinite(a);
  const bNull = b === null || b === undefined || !Number.isFinite(b);
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const diff = (a as number) - (b as number);
  return dir === "asc" ? diff : -diff;
}

function readStoredTargetMargin(): number {
  if (typeof window === "undefined") return DEFAULT_TARGET_MARGIN_PERCENT;
  try {
    const raw = localStorage.getItem(TARGET_MARGIN_STORAGE_KEY);
    if (raw === null) return DEFAULT_TARGET_MARGIN_PERCENT;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return DEFAULT_TARGET_MARGIN_PERCENT;
    }
    return parsed;
  } catch {
    return DEFAULT_TARGET_MARGIN_PERCENT;
  }
}

function readStoredMarginBasis(): MarginBasis {
  if (typeof window === "undefined") return "contribution";
  try {
    const raw = localStorage.getItem(MARGIN_BASIS_STORAGE_KEY);
    return raw === "afterAds" ? "afterAds" : "contribution";
  } catch {
    return "contribution";
  }
}

type CostOverrides = {
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
};

type MinPriceSuggestion = MinSalePriceResult & {
  refined?: boolean;
};

function costsMatchRow(
  costs: CostOverrides,
  row: FinancialEvaluationRow,
): boolean {
  return (
    costs.productCost === row.productCost &&
    costs.extraCosts === row.extraCosts &&
    costs.taxRatePercent === row.taxRatePercent
  );
}

function resolveMinPriceSuggestion(
  row: FinancialEvaluationRow,
  targetMarginPercent: number,
  marginBasis: MarginBasis,
  costs: CostOverrides,
): MinPriceSuggestion {
  const serverMatches =
    costsMatchRow(costs, row) &&
    row.minSalePriceForTarget &&
    row.minSalePriceTargetPercent === targetMarginPercent &&
    row.minSalePriceMarginBasis === marginBasis;

  if (serverMatches && row.minSalePriceForTarget) {
    return {
      ...row.minSalePriceForTarget,
      refined: row.minSalePriceRefined ?? false,
    };
  }

  return {
    ...buildMinPriceSuggestion(row, targetMarginPercent, marginBasis, costs),
    refined: false,
  };
}

function buildMinPriceSuggestion(
  row: FinancialEvaluationRow,
  targetMarginPercent: number,
  marginBasis: MarginBasis,
  costs: CostOverrides,
): MinSalePriceResult {
  if (
    row.mlFeeAmount === null ||
    row.shippingCost === null ||
    !row.breakdown ||
    row.salePrice <= 0
  ) {
    return {
      minSalePrice: null,
      currentMarginPercent: null,
      alreadyMeetsTarget: false,
      reason: "incomplete",
    };
  }

  const breakdown = computeFinancialMargin({
    salePrice: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    mlFeeRebate: row.mlFeeRebate ?? 0,
    shippingCost: row.shippingCost,
    productCost: costs.productCost,
    extraCosts: costs.extraCosts,
    taxRatePercent: costs.taxRatePercent,
    listingTypeLabel: row.listingTypeLabel,
  });

  const afterAds =
    row.adsMetricsAvailable && marginBasis === "afterAds"
      ? computeMarginAfterAds({
          marginBreakdown: breakdown,
          tacosPercent: row.tacosPercent,
          adsCost: row.adsCost,
          unitsSold: row.adsUnitsSold,
        })
      : null;

  return computeMinSalePriceForTargetMargin({
    salePrice: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    mlFeeRebate: row.mlFeeRebate ?? 0,
    shippingCost: row.shippingCost,
    productCost: costs.productCost,
    extraCosts: costs.extraCosts,
    taxRatePercent: costs.taxRatePercent,
    targetMarginPercent,
    marginBasis,
    tacosPercent: row.tacosPercent,
    currentContributionMarginPercent: breakdown.marginPercent,
    currentAfterAdsMarginPercent: afterAds?.marginAfterAdsPercent ?? null,
  });
}

function marginTone(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) {
    return "text-[var(--muted-foreground)]";
  }
  if (margin > 0) return "text-emerald-600";
  if (margin < 0) return "text-rose-600";
  return "text-[var(--muted-foreground)]";
}

const currentSectionClass = "bg-[var(--muted)]/10";

const decisionSectionClass =
  "border-l border-sky-200/90 bg-sky-50/50 px-2 dark:border-sky-800/80 dark:bg-sky-950/25";

const tableCellPad = "px-3 py-3";
const tableHeadPad = "px-3 py-2";

function sectionGroupPill(variant: "current" | "decision") {
  return cn(
    "inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
    variant === "current"
      ? "bg-[var(--muted)]/40 text-[var(--muted-foreground)]"
      : "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  );
}

function StackedMarginCell({
  percent,
  value,
  sublabel,
  unavailable,
}: {
  percent: number | null;
  value: number | null;
  sublabel?: string | null;
  unavailable?: boolean;
}) {
  if (unavailable) {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }

  return (
    <div className="text-right">
      <div className={cn("font-semibold", marginTone(percent))}>
        {formatFinancialPercent(percent)}
      </div>
      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {formatFinancialMoney(value)}
      </div>
      {sublabel ? (
        <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

type MinPricesApiResponse = {
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  patches: Array<{
    mlItemId: string;
    minSalePriceForTarget: MinSalePriceResult | null;
    minSalePriceTargetPercent: number | null;
    minSalePriceMarginBasis: MarginBasis | null;
    minSalePriceRefined: boolean;
  }>;
};

function MinPriceCellSkeleton() {
  return (
    <div
      className="ml-auto h-4 w-16 animate-pulse rounded bg-sky-200/80 dark:bg-sky-800/50"
      aria-hidden
    />
  );
}

function MinPriceTableCell({
  row,
  targetMarginPercent,
  marginBasis,
  refining,
  showProportionalWhileStale,
}: {
  row: FinancialEvaluationRow;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  refining?: boolean;
  showProportionalWhileStale?: boolean;
}) {
  const suggestion = useMemo(
    () =>
      resolveMinPriceSuggestion(row, targetMarginPercent, marginBasis, {
        productCost: row.productCost,
        extraCosts: row.extraCosts,
        taxRatePercent: row.taxRatePercent,
      }),
    [row, targetMarginPercent, marginBasis],
  );

  if (refining) {
    return <MinPriceCellSkeleton />;
  }

  const isProportionalFallback =
    showProportionalWhileStale && !suggestion.refined;

  if (suggestion.reason === "missing_product_cost") {
    return (
      <span
        className="text-xs text-[var(--muted-foreground)]"
        title="Preencha o custo do produto"
      >
        Sem custo
      </span>
    );
  }

  if (
    suggestion.reason === "incomplete" ||
    suggestion.reason === "impossible"
  ) {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }

  const meetsOrBeatsTarget = suggestion.alreadyMeetsTarget;
  const needsHigherPrice =
    suggestion.minSalePrice !== null &&
    suggestion.minSalePrice > row.salePrice + 0.005;

  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        meetsOrBeatsTarget && !needsHigherPrice
          ? "text-emerald-600"
          : "text-amber-700 dark:text-amber-500",
      )}
      title={`Mínimo para ${formatFinancialPercent(targetMarginPercent)} de ${marginBasisLabel(marginBasis)} · atual ${formatFinancialMoney(row.salePrice)} (${formatFinancialPercent(suggestion.currentMarginPercent)})${suggestion.refined ? " · taxa e frete ML no preço sugerido" : isProportionalFallback ? " · estimativa proporcional (clique em Atualizar)" : " · estimativa proporcional"}`}
    >
      {formatFinancialMoney(suggestion.minSalePrice)}
      {isProportionalFallback ? (
        <span className="ml-1 text-[10px] font-normal text-[var(--muted-foreground)]">
          ~
        </span>
      ) : null}
    </span>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  className,
  title,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  title?: string;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  const Icon = !active
    ? ArrowUpDown
    : activeDir === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <th className={cn(className, "cursor-pointer")} title={title}>
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 font-medium hover:text-[var(--foreground)]",
          align === "right" && "ml-auto flex-row-reverse",
          active && "text-[var(--foreground)]",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  );
}

export function FinancialEvaluationClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinancialEvaluationRow[] | null>(null);
  const [wholesaleReductions, setWholesaleReductions] =
    useState<WholesaleReductionSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetMarginPercent, setTargetMarginPercent] = useState(
    readStoredTargetMargin,
  );
  const [marginBasis, setMarginBasis] = useState(readStoredMarginBasis);
  const [refiningMinPrices, setRefiningMinPrices] = useState(false);
  const [minPriceError, setMinPriceError] = useState<string | null>(null);
  const [appliedTargetMargin, setAppliedTargetMargin] = useState<number | null>(
    null,
  );
  const [appliedMarginBasis, setAppliedMarginBasis] =
    useState<MarginBasis | null>(null);
  const initialMinPriceRefineDone = useRef(false);
  const [evaluationMode, setEvaluationMode] =
    useState<EvaluationMode>("current");
  const [fromDate, setFromDate] = useState(todayYmdLocal);
  const [toDate, setToDate] = useState(todayYmdLocal);
  const [rangePreset, setRangePreset] = useState<"custom" | 7 | 15 | 30>(
    "custom",
  );
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [appliedTo, setAppliedTo] = useState<string | null>(null);
  const [periodSalesCount, setPeriodSalesCount] = useState<number | null>(null);
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("product");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showPaused, setShowPaused] = useState(false);

  const isPeriodMode = evaluationMode === "period";

  const minPriceStale =
    data !== null &&
    !isPeriodMode &&
    (appliedTargetMargin !== targetMarginPercent ||
      appliedMarginBasis !== marginBasis);

  useEffect(() => {
    try {
      localStorage.setItem(
        TARGET_MARGIN_STORAGE_KEY,
        String(targetMarginPercent),
      );
    } catch {
      // ignore quota / private mode
    }
  }, [targetMarginPercent]);

  useEffect(() => {
    try {
      localStorage.setItem(MARGIN_BASIS_STORAGE_KEY, marginBasis);
    } catch {
      // ignore quota / private mode
    }
  }, [marginBasis]);

  const statusVisibleItems = useMemo(
    () =>
      data
        ? filterListingsByPausedVisibility(
            data,
            showPaused,
            (row) => row.status,
          )
        : [],
    [data, showPaused],
  );

  const pausedCount = useMemo(
    () => (data ? countPausedListings(data, (row) => row.status) : 0),
    [data],
  );

  const filteredItems = useMemo(
    () =>
      filterByItemListSearch(statusVisibleItems, searchQuery, (row) => ({
        sku: row.sku,
        title: row.title,
        mlItemId: row.mlItemId,
      })),
    [statusVisibleItems, searchQuery],
  );

  const sortedItems = useMemo(() => {
    const rows = [...filteredItems];
    rows.sort((a, b) => {
      if (sortKey === "product") {
        const keyA = (a.sku ?? a.title ?? a.mlItemId).toLowerCase();
        const keyB = (b.sku ?? b.title ?? b.mlItemId).toLowerCase();
        const cmp = keyA.localeCompare(keyB, "pt-BR");
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortKey === "price") {
        return compareNullableNumber(a.salePrice, b.salePrice, sortDir);
      }
      if (sortKey === "margin") {
        return compareNullableNumber(
          a.breakdown?.marginPercent,
          b.breakdown?.marginPercent,
          sortDir,
        );
      }
      return compareNullableNumber(
        a.marginAfterAdsPercent,
        b.marginAfterAdsPercent,
        sortDir,
      );
    });
    return rows;
  }, [filteredItems, sortKey, sortDir]);

  const overallAverages = useMemo(() => {
    if (!statusVisibleItems.length) {
      return {
        contributionPercent: null as number | null,
        afterAdsPercent: null as number | null,
        listingCount: 0,
      };
    }

    let contributionSum = 0;
    let contributionCount = 0;
    let afterAdsSum = 0;
    let afterAdsCount = 0;

    for (const row of statusVisibleItems) {
      const contribution = row.breakdown?.marginPercent;
      if (contribution !== null && contribution !== undefined) {
        contributionSum += contribution;
        contributionCount += 1;
      }
      if (
        row.adsMetricsAvailable &&
        row.marginAfterAdsPercent !== null &&
        row.marginAfterAdsPercent !== undefined
      ) {
        afterAdsSum += row.marginAfterAdsPercent;
        afterAdsCount += 1;
      }
    }

    return {
      contributionPercent:
        contributionCount > 0
          ? Math.round((contributionSum / contributionCount) * 100) / 100
          : null,
      afterAdsPercent:
        afterAdsCount > 0
          ? Math.round((afterAdsSum / afterAdsCount) * 100) / 100
          : null,
      listingCount: statusVisibleItems.length,
    };
  }, [statusVisibleItems]);

  const selectedRow = useMemo(
    () => data?.find((row) => row.mlItemId === selectedId) ?? null,
    [data, selectedId],
  );

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return;
      }
      setSortKey(key);
      // Numéricos: maior→menor no 1º clique; Produto: A→Z
      setSortDir(key === "product" ? "asc" : "desc");
    },
    [sortKey],
  );

  const loadData = useCallback(
    async (options?: {
      itemIds?: string[];
      mode?: EvaluationMode;
      from?: string;
      to?: string;
      clear?: boolean;
    }) => {
      const mode = options?.mode ?? "current";
      const itemIds = options?.itemIds;
      setLoading(true);
      setError(null);
      if (options?.clear || mode === "period") {
        setData(null);
      }
      try {
        const url = new URL(
          "/api/financial-evaluation",
          window.location.origin,
        );
        if (mode === "period" && options?.from && options?.to) {
          url.searchParams.set("from", options.from);
          url.searchParams.set("to", options.to);
        } else if (itemIds?.length) {
          url.searchParams.set("itemIds", itemIds.join(","));
        }
        const res = await fetch(url.toString());
        const json = (await res.json()) as ApiResponse | { error?: string };
        if (!res.ok) {
          setError(
            (json as { error?: string }).error ??
              "Falha ao carregar lucratividade.",
          );
          return null;
        }
        const payload = json as ApiResponse;
        setData(payload.items);
        setWholesaleReductions(payload.wholesaleReductions);
        setEvaluationMode(payload.mode ?? mode);
        if (payload.mode === "period") {
          setAppliedFrom(payload.from ?? options?.from ?? null);
          setAppliedTo(payload.to ?? options?.to ?? null);
          setPeriodSalesCount(payload.salesCount ?? null);
          setPeriodDays(payload.periodDays ?? null);
          setAppliedTargetMargin(null);
          setAppliedMarginBasis(null);
          initialMinPriceRefineDone.current = true;
        } else {
          setAppliedFrom(null);
          setAppliedTo(null);
          setPeriodSalesCount(null);
          setPeriodDays(null);
          if (itemIds?.length) {
            setAppliedTargetMargin(null);
            setAppliedMarginBasis(null);
          }
        }
        return payload.items;
      } catch {
        setError("Falha de rede ao carregar lucratividade.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const saveWholesaleReductions = useCallback(
    async (values: WholesaleReductionSettings) => {
      setError(null);
      const res = await fetch("/api/company-tax-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wholesaleReductions: values }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "wholesale_settings_update_failed"));
        throw new Error("wholesale save failed");
      }
      const json = (await res.json()) as {
        wholesaleReductions: WholesaleReductionSettings;
      };
      setWholesaleReductions(json.wholesaleReductions);
    },
    [],
  );

  const refineMinPrices = useCallback(
    async (itemIds?: string[]) => {
      setRefiningMinPrices(true);
      setMinPriceError(null);
      try {
        const url = new URL(
          "/api/financial-evaluation/min-prices",
          window.location.origin,
        );
        url.searchParams.set(
          "targetMarginPercent",
          String(targetMarginPercent),
        );
        url.searchParams.set("marginBasis", marginBasis);
        if (itemIds?.length) {
          url.searchParams.set("itemIds", itemIds.join(","));
        }
        const res = await fetch(url.toString());
        const json = (await res.json()) as
          | MinPricesApiResponse
          | { error?: string };
        if (!res.ok) {
          setMinPriceError(
            (json as { error?: string }).error ??
              "Falha ao calcular preços mínimos.",
          );
          return;
        }
        const { patches } = json as MinPricesApiResponse;
        const patchById = new Map(
          patches.map((patch) => [patch.mlItemId, patch]),
        );

        setData((prev) => {
          if (!prev) return prev;
          return prev.map((row) => {
            const patch = patchById.get(row.mlItemId);
            if (!patch) return row;
            return {
              ...row,
              minSalePriceForTarget: patch.minSalePriceForTarget,
              minSalePriceTargetPercent: patch.minSalePriceTargetPercent,
              minSalePriceMarginBasis: patch.minSalePriceMarginBasis,
              minSalePriceRefined: patch.minSalePriceRefined,
            };
          });
        });
        setAppliedTargetMargin(targetMarginPercent);
        setAppliedMarginBasis(marginBasis);
      } catch {
        setMinPriceError("Falha de rede ao calcular preços mínimos.");
      } finally {
        setRefiningMinPrices(false);
      }
    },
    [targetMarginPercent, marginBasis],
  );

  useEffect(() => {
    void loadData({ mode: "current" });
  }, [loadData]);

  useEffect(() => {
    if (isPeriodMode) return;
    if (!data?.length || initialMinPriceRefineDone.current) return;
    initialMinPriceRefineDone.current = true;
    void refineMinPrices(data.map((row) => row.mlItemId));
  }, [data, refineMinPrices, isPeriodMode]);

  const applyPeriod = useCallback(() => {
    if (!fromDate || !toDate) {
      setError("Informe as datas De e Até.");
      return;
    }
    if (fromDate > toDate) {
      setError("A data inicial não pode ser maior que a final.");
      return;
    }
    setRangePreset("custom");
    initialMinPriceRefineDone.current = true;
    void loadData({ mode: "period", from: fromDate, to: toDate });
  }, [fromDate, toDate, loadData]);

  const applyPreset = useCallback(
    (days: 7 | 15 | 30) => {
      const { from, to } = lastDaysYmdRange(days);
      setRangePreset(days);
      setFromDate(from);
      setToDate(to);
      initialMinPriceRefineDone.current = true;
      void loadData({ mode: "period", from, to });
    },
    [loadData],
  );

  const switchToCurrent = useCallback(() => {
    initialMinPriceRefineDone.current = false;
    setRangePreset("custom");
    void (async () => {
      const items = await loadData({ mode: "current", clear: true });
      if (items?.length) {
        await refineMinPrices(items.map((row) => row.mlItemId));
      }
    })();
  }, [loadData, refineMinPrices]);

  const tacosPeriodLabel = isPeriodMode
    ? periodDays === 1
      ? "deste dia"
      : appliedFrom && appliedTo
        ? `de ${appliedFrom} a ${appliedTo}`
        : "deste período"
    : "dos últimos 7 dias";

  return (
    <div className="space-y-6">
      <WholesaleReductionSettingsCard
        values={wholesaleReductions}
        loading={loading && wholesaleReductions === null}
        onSave={saveWholesaleReductions}
      />

      <Card className="border-[var(--border)]">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">
              {isPeriodMode
                ? "Margem por vendas no período"
                : "Anúncios operacionais"}
            </CardTitle>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {isPeriodMode
                ? "Preço médio das vendas no período; custos/impostos do cadastro atual; Pós ADS com TACOS do mesmo período. Só anúncios com venda."
                : "Clique em um anúncio para ver o detalhamento completo. Pausados ficam ocultos por padrão."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ShowPausedListingsSwitch
              checked={showPaused}
              onCheckedChange={setShowPaused}
              pausedCount={pausedCount}
              disabled={loading || !data?.length}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loading}
              onClick={() => {
                void (async () => {
                  if (isPeriodMode && appliedFrom && appliedTo) {
                    await loadData({
                      mode: "period",
                      from: appliedFrom,
                      to: appliedTo,
                    });
                    return;
                  }
                  const items = await loadData({ mode: "current" });
                  if (items?.length) {
                    await refineMinPrices(items.map((row) => row.mlItemId));
                  }
                })();
              }}
            >
              <RefreshCw
                className={cn("size-4", loading && "animate-spin")}
                aria-hidden
              />
              Recalcular margens
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 px-3 py-2">
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
              <Button
                type="button"
                size="sm"
                variant={!isPeriodMode ? "default" : "ghost"}
                className="h-8 rounded-md px-3 text-xs"
                disabled={loading}
                onClick={() => {
                  if (!isPeriodMode) return;
                  switchToCurrent();
                }}
              >
                Atual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isPeriodMode ? "default" : "ghost"}
                className="h-8 rounded-md px-3 text-xs"
                disabled={loading}
                onClick={applyPeriod}
              >
                Por data
              </Button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--muted-foreground)]">
                Período
              </label>
              <DateRangePicker
                fromYmd={fromDate}
                toYmd={toDate}
                disabled={loading}
                onChange={(from, to) => {
                  setRangePreset("custom");
                  setFromDate(from);
                  setToDate(to);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={
                  isPeriodMode && rangePreset === 7 ? "default" : "outline"
                }
                size="sm"
                className="h-[38px]"
                disabled={loading}
                onClick={() => applyPreset(7)}
              >
                Últimos 7 dias
              </Button>
              <Button
                type="button"
                variant={
                  isPeriodMode && rangePreset === 15 ? "default" : "outline"
                }
                size="sm"
                className="h-[38px]"
                disabled={loading}
                onClick={() => applyPreset(15)}
              >
                Últimos 15 dias
              </Button>
              <Button
                type="button"
                variant={
                  isPeriodMode && rangePreset === 30 ? "default" : "outline"
                }
                size="sm"
                className="h-[38px]"
                disabled={loading}
                onClick={() => applyPreset(30)}
              >
                Últimos 30 dias
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-[38px]"
              disabled={loading || !fromDate || !toDate}
              onClick={applyPeriod}
            >
              Aplicar período
            </Button>
            {isPeriodMode && appliedFrom && appliedTo ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                {appliedFrom === appliedTo
                  ? `Dia ${appliedFrom}`
                  : `${appliedFrom} → ${appliedTo}`}
                {periodSalesCount != null
                  ? ` · ${periodSalesCount} un. vendidas`
                  : null}
              </p>
            ) : null}
          </div>

          {data && overallAverages.listingCount > 0 ? (
            <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
              <p className="text-sm text-[var(--foreground)]">
                No geral
                {isPeriodMode && appliedFrom && appliedTo
                  ? appliedFrom === appliedTo
                    ? ` (dia ${appliedFrom})`
                    : ` (${appliedFrom} → ${appliedTo})`
                  : ""}
                , lucratividade média de{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    marginTone(overallAverages.contributionPercent),
                  )}
                >
                  {formatFinancialPercent(overallAverages.contributionPercent)}
                </span>{" "}
                <span className="text-[var(--muted-foreground)]">
                  (contribuição)
                </span>
                {overallAverages.afterAdsPercent !== null ? (
                  <>
                    {" · "}
                    Pós ADS{" "}
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        marginTone(overallAverages.afterAdsPercent),
                      )}
                    >
                      {formatFinancialPercent(overallAverages.afterAdsPercent)}
                    </span>
                  </>
                ) : null}
                <span className="text-[var(--muted-foreground)]">
                  {" "}
                  · média entre {overallAverages.listingCount} anúncio
                  {overallAverages.listingCount === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[var(--muted-foreground)]">
                {isPeriodMode
                  ? "Como calculamos: somamos o valor de cada venda do período e dividimos pelas unidades vendidas → preço médio por anúncio; com esse preço calculamos a margem. No topo, média simples entre anúncios (cada um com o mesmo peso)."
                  : "Como calculamos: média simples das margens dos anúncios listados (mesmo peso cada um, sem ponderar por volume de vendas)."}
              </p>
            </div>
          ) : null}

          {data ? (
            <ItemListSearch
              value={searchQuery}
              onChange={setSearchQuery}
              filteredCount={sortedItems.length}
              totalCount={statusVisibleItems.length}
              placeholder="Buscar por SKU, título ou MLB…"
              className="mb-4"
            />
          ) : null}

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          {loading && !data ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Carregando margens…
            </p>
          ) : null}

          {data && sortedItems.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {isPeriodMode && !searchQuery
                ? "Nenhuma venda paga neste período."
                : itemListSearchEmptyMessage(searchQuery)}
            </p>
          ) : null}

          {data && sortedItems.length > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/15 px-3 py-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {isPeriodMode ? (
                      <>
                        Margem com preço médio das vendas; Pós ADS usa TACOS{" "}
                        {tacosPeriodLabel}. Custos e impostos do cadastro atual.
                      </>
                    ) : (
                      <>
                        Sugestão usa meta de{" "}
                        <span className="font-medium text-[var(--foreground)]">
                          {formatFinancialPercent(targetMarginPercent)}
                        </span>{" "}
                        ({marginBasisLabel(marginBasis)}). Pós ADS: TACOS{" "}
                        {tacosPeriodLabel}.
                      </>
                    )}
                  </p>
                  {minPriceStale ? (
                    <p className="text-xs text-amber-700 dark:text-amber-500">
                      Meta alterada — atualize os preços mínimos com taxa e
                      frete ML.
                    </p>
                  ) : null}
                  {minPriceError ? (
                    <p className="text-xs text-red-600" role="alert">
                      {minPriceError}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-36">
                    <MaskedPercentField
                      id="target-margin-percent"
                      label="Meta de margem"
                      value={targetMarginPercent}
                      onValueChange={(value) => {
                        if (value !== null && Number.isFinite(value)) {
                          setTargetMarginPercent(value);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-sm font-medium">
                      Base da meta
                    </span>
                    <div className="flex rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          marginBasis === "contribution" ? "default" : "ghost"
                        }
                        className="h-8 rounded-md px-3 text-xs"
                        onClick={() => setMarginBasis("contribution")}
                      >
                        Contribuição
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          marginBasis === "afterAds" ? "default" : "ghost"
                        }
                        className="h-8 rounded-md px-3 text-xs"
                        onClick={() => setMarginBasis("afterAds")}
                      >
                        Pós ADS
                      </Button>
                    </div>
                  </div>
                  {!isPeriodMode ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={minPriceStale ? "default" : "outline"}
                      className="h-[42px] gap-2"
                      disabled={
                        refiningMinPrices ||
                        loading ||
                        !data?.length ||
                        !minPriceStale
                      }
                      onClick={() => {
                        if (!data?.length) return;
                        void refineMinPrices(data.map((row) => row.mlItemId));
                      }}
                    >
                      <Calculator
                        className={cn(
                          "size-4",
                          refiningMinPrices && "animate-pulse",
                        )}
                        aria-hidden
                      />
                      {refiningMinPrices
                        ? "Consultando ML…"
                        : "Atualizar P/ meta"}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[7%]" />
                    <col className="w-[9%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[9%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-[var(--muted-foreground)]">
                      <th colSpan={3} className={cn(tableHeadPad, "pt-2")} />
                      <th
                        colSpan={2}
                        className={cn(
                          currentSectionClass,
                          tableHeadPad,
                          "pt-2 pb-1 text-center",
                        )}
                      >
                        <span className={sectionGroupPill("current")}>
                          {isPeriodMode ? "No período" : "Situação atual"}
                        </span>
                      </th>
                      <th
                        colSpan={1}
                        className={cn(
                          decisionSectionClass,
                          tableHeadPad,
                          "pt-2 pb-1 text-center",
                        )}
                      >
                        <span className={sectionGroupPill("decision")}>
                          Decidir
                        </span>
                      </th>
                    </tr>
                    <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                      <SortableTh
                        label="Produto"
                        sortKey="product"
                        activeKey={sortKey}
                        activeDir={sortDir}
                        onSort={toggleSort}
                        className={cn(tableHeadPad)}
                      />
                      <th className={cn(tableHeadPad, "font-medium")}>Tipo</th>
                      <SortableTh
                        label="Preço"
                        sortKey="price"
                        activeKey={sortKey}
                        activeDir={sortDir}
                        onSort={toggleSort}
                        className={cn(tableHeadPad, "text-right")}
                        align="right"
                        title={
                          isPeriodMode
                            ? "Preço médio ponderado das vendas no período"
                            : undefined
                        }
                      />
                      <SortableTh
                        label="Margem"
                        sortKey="margin"
                        activeKey={sortKey}
                        activeDir={sortDir}
                        onSort={toggleSort}
                        className={cn(
                          currentSectionClass,
                          tableHeadPad,
                          "text-right",
                        )}
                        align="right"
                        title="Margem de contribuição (% em destaque, R$ abaixo)"
                      />
                      <SortableTh
                        label="Pós ADS"
                        sortKey="afterAds"
                        activeKey={sortKey}
                        activeDir={sortDir}
                        onSort={toggleSort}
                        className={cn(
                          currentSectionClass,
                          tableHeadPad,
                          "text-right",
                        )}
                        align="right"
                        title={`Margem de contribuição menos TACOS (${tacosPeriodLabel})`}
                      />
                      <th
                        className={cn(
                          decisionSectionClass,
                          tableHeadPad,
                          "font-medium text-right",
                        )}
                        title={`Preço mínimo para ${formatFinancialPercent(targetMarginPercent)} (${marginBasisLabel(marginBasis)})`}
                      >
                        P/ meta
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((row) => {
                      const marginValue = row.breakdown?.marginValue ?? null;
                      const marginPercent =
                        row.breakdown?.marginPercent ?? null;
                      const afterAdsPercent = row.marginAfterAdsPercent;
                      const afterAdsValue = row.marginAfterAdsValue;
                      const tacosSublabel =
                        row.adsMetricsAvailable &&
                        row.tacosPercent != null &&
                        row.tacosPercent > 0
                          ? `TACOS ${formatFinancialPercent(row.tacosPercent)}`
                          : null;
                      return (
                        <tr
                          key={row.mlItemId}
                          className={cn(
                            "cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]/30",
                            listingRowMutedClass(row.status, 0, 0),
                          )}
                          onClick={() => setSelectedId(row.mlItemId)}
                        >
                          <td className={tableCellPad}>
                            <div className="flex items-center gap-3">
                              {row.imageUrl ? (
                                <Image
                                  src={row.imageUrl}
                                  alt={row.title}
                                  width={40}
                                  height={40}
                                  className="size-10 rounded-md object-cover"
                                />
                              ) : (
                                <div className="size-10 rounded-md bg-[var(--muted)]" />
                              )}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-medium">
                                    {row.sku ?? row.title}
                                  </p>
                                  <ListingStatusBadge
                                    status={row.status}
                                    mlStock={0}
                                    warehouseStock={0}
                                  />
                                </div>
                                <p className="truncate text-xs text-[var(--muted-foreground)]">
                                  {row.mlItemId}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className={tableCellPad}>
                            {row.listingTypeLabel ?? "—"}
                          </td>
                          <td className={cn(tableCellPad, "text-right")}>
                            <div>{formatFinancialMoney(row.salePrice)}</div>
                            {row.hasPromotion && row.regularPrice != null ? (
                              <div className="text-xs text-[var(--muted-foreground)] line-through">
                                {formatFinancialMoney(row.regularPrice)}
                              </div>
                            ) : null}
                          </td>
                          <td className={cn(currentSectionClass, tableCellPad)}>
                            <StackedMarginCell
                              percent={marginPercent}
                              value={marginValue}
                            />
                          </td>
                          <td className={cn(currentSectionClass, tableCellPad)}>
                            <StackedMarginCell
                              percent={afterAdsPercent}
                              value={afterAdsValue}
                              sublabel={tacosSublabel}
                              unavailable={!row.adsMetricsAvailable}
                            />
                          </td>
                          <td
                            className={cn(
                              decisionSectionClass,
                              tableCellPad,
                              "text-right",
                            )}
                          >
                            <MinPriceTableCell
                              row={row}
                              targetMarginPercent={targetMarginPercent}
                              marginBasis={marginBasis}
                              refining={refiningMinPrices && !isPeriodMode}
                              showProportionalWhileStale={minPriceStale}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {selectedRow && wholesaleReductions ? (
        <FinancialDetailModal
          row={selectedRow}
          targetMarginPercent={targetMarginPercent}
          marginBasis={marginBasis}
          refiningMinPrices={refiningMinPrices}
          minPriceStale={minPriceStale}
          wholesaleReductions={wholesaleReductions}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function MarginPriceSuggestion({
  row,
  targetMarginPercent,
  marginBasis,
  productCost,
  extraCosts,
  taxRatePercent,
  refining,
  minPriceStale,
}: {
  row: FinancialEvaluationRow;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
  refining?: boolean;
  minPriceStale?: boolean;
}) {
  const suggestion = useMemo(
    () =>
      resolveMinPriceSuggestion(row, targetMarginPercent, marginBasis, {
        productCost,
        extraCosts,
        taxRatePercent,
      }),
    [
      row,
      targetMarginPercent,
      marginBasis,
      productCost,
      extraCosts,
      taxRatePercent,
    ],
  );

  const basisLabel = marginBasisLabel(marginBasis);
  const targetLabel = formatFinancialPercent(targetMarginPercent);

  if (refining) {
    return (
      <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm dark:border-sky-800 dark:bg-sky-950/30">
        <p className="font-medium text-sky-900 dark:text-sky-100">
          Sugestão de preço
        </p>
        <div className="mt-2 space-y-2">
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-sky-200/80 dark:bg-sky-800/50" />
          <div className="h-3 w-48 animate-pulse rounded bg-sky-200/60 dark:bg-sky-800/40" />
        </div>
        <p className="mt-2 text-xs text-sky-800 dark:text-sky-200">
          Consultando taxa e frete ML…
        </p>
      </div>
    );
  }

  let message: string;
  let toneClass =
    "border-[var(--border)] bg-[var(--muted)]/20 text-[var(--foreground)]";

  if (suggestion.reason === "missing_product_cost") {
    message =
      "Cadastre o produto em Meus produtos (SKU do anúncio) para calcular o preço mínimo sugerido.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-900";
  } else if (suggestion.reason === "incomplete") {
    message = "Dados insuficientes para sugerir preço mínimo.";
    toneClass =
      "border-[var(--border)] bg-[var(--muted)]/20 text-[var(--muted-foreground)]";
  } else if (suggestion.reason === "impossible") {
    message = `Com os custos atuais, não é possível atingir ${targetLabel} de ${basisLabel}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else {
    const aboveTargetNote = suggestion.alreadyMeetsTarget
      ? " Você já está acima da meta."
      : "";
    message = `Preço mínimo para ${targetLabel} de ${basisLabel}: ${formatFinancialMoney(suggestion.minSalePrice)}. Preço atual: ${formatFinancialMoney(row.salePrice)} (${formatFinancialPercent(suggestion.currentMarginPercent)}).${aboveTargetNote}`;
    toneClass = suggestion.alreadyMeetsTarget
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-sky-200 bg-sky-50 text-sky-900";
  }

  return (
    <div className={cn("mt-4 rounded-lg border px-3 py-2 text-sm", toneClass)}>
      <p className="font-medium">Sugestão de preço</p>
      <p className="mt-1">{message}</p>
      <p className="mt-1 text-xs opacity-80">
        {suggestion.refined
          ? "Taxa ML e frete consultados no preço sugerido (API Mercado Livre)."
          : minPriceStale
            ? "Estimativa proporcional — use «Atualizar P/ meta» na tabela para consultar o ML."
            : "Estimativa com taxa ML e frete proporcionais ao preço atual."}
      </p>
    </div>
  );
}

function wholesalePriceReasonLabel(reason: WholesalePriceLevelReason): string {
  switch (reason) {
    case "missing_current_margin":
      return "Margem atual indisponível";
    case "missing_product_cost":
      return "Cadastre o custo em Meus produtos";
    case "impossible":
      return "Meta inatingível com custos atuais";
    case "incomplete":
      return "Dados insuficientes";
    case "ok":
      return "";
  }
}

function WholesalePricesSection({
  row,
  wholesaleReductions,
}: {
  row: FinancialEvaluationRow;
  wholesaleReductions: WholesaleReductionSettings;
}) {
  const [pendingLevels, setPendingLevels] = useState<Array<1 | 2 | 3> | null>(
    null,
  );
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState<{
    anchor: { netAmount: number } | null;
    tiers: Array<{
      level: number;
      minPurchaseUnit: number;
      netAmount: number;
    }>;
  } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const levels = useMemo(
    () =>
      computeWholesalePricesForListing({
        salePrice: row.salePrice,
        mlFeeAmount: row.mlFeeAmount,
        mlFeeRebate: row.mlFeeRebate,
        shippingCost: row.shippingCost,
        productCost: row.productCost,
        extraCosts: row.extraCosts,
        currentMarginPercent: row.breakdown?.marginPercent ?? null,
        currentMarginValue: row.breakdown?.marginValue ?? null,
        reductions: wholesaleReductionsToTuple(wholesaleReductions),
      }),
    [row, wholesaleReductions],
  );

  const applicableLevels = levels.filter(
    (level) => level.suggestedPrice !== null && level.reason === "ok",
  );

  async function applyToMl(levelsToApply: Array<1 | 2 | 3>) {
    setApplying(true);
    setApplyError(null);
    setApplySuccess(null);
    try {
      const res = await fetch(
        `/api/ml/items/${encodeURIComponent(row.mlItemId)}/wholesale-prices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ levels: levelsToApply }),
        },
      );
      if (!res.ok) {
        setApplyError(await readApiError(res, "wholesale_apply_failed"));
        return;
      }
      const json = (await res.json()) as {
        anchor?: { netAmount: number };
        tiers?: Array<{
          level: number;
          minPurchaseUnit: number;
          netAmount: number;
        }>;
      };
      setApplySuccess({
        anchor: json.anchor ? { netAmount: json.anchor.netAmount } : null,
        tiers: json.tiers ?? [],
      });
      setPendingLevels(null);
    } catch {
      setApplyError("Falha de rede ao aplicar preços no Mercado Livre.");
    } finally {
      setApplying(false);
    }
  }

  const pendingRows: Array<{
    key: string;
    label: string;
    minPurchaseUnit: number;
    netAmount: number | null;
    isAnchor?: boolean;
  }> =
    pendingLevels?.flatMap((level) => {
      const computed = levels[level - 1];

      if (isWholesaleAnchorLevel(level)) {
        return [
          {
            key: `level-1`,
            label: "Nível 1 · Âncora ML",
            minPurchaseUnit: 1,
            netAmount: computed?.suggestedPrice ?? null,
            isAnchor: true,
          },
        ];
      }

      return [
        {
          key: `discount-${level}`,
          label: `Nível ${level}`,
          minPurchaseUnit: mlDiscountMinPurchaseUnitForLevel(
            level,
            wholesaleReductions,
          ),
          netAmount: computed?.suggestedPrice ?? null,
        },
      ];
    }) ?? [];

  return (
    <details className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/10">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-[var(--foreground)]">
        Preços atacado (B2B)
      </summary>
      <div className="border-t border-[var(--border)] px-3 py-3">
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">
          Margem atual:{" "}
          <span className="font-medium text-[var(--foreground)]">
            {formatFinancialMoney(row.breakdown?.marginValue ?? null)}
          </span>{" "}
          ({formatFinancialPercent(row.breakdown?.marginPercent ?? null)}).
          Preço líquido sugerido = taxa ML + frete + custos + margem após
          redução.
        </p>

        {applySuccess ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p className="font-medium">Preços atacado aplicados no ML</p>
            <ul className="mt-2 space-y-1">
              {applySuccess.tiers.map((tier) => (
                <li key={tier.level}>
                  Nível {tier.level} · {tier.minPurchaseUnit}+ un ·{" "}
                  <span className="font-semibold tabular-nums">
                    {formatFinancialMoney(tier.netAmount)}
                  </span>
                </li>
              ))}
            </ul>
            {applySuccess.anchor ? (
              <p className="mt-2 text-xs text-emerald-800">
                Âncora ML (1 un · nível 1):{" "}
                <span className="tabular-nums">
                  {formatFinancialMoney(applySuccess.anchor.netAmount)}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
        {applyError ? (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {applyError}
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={applying || applicableLevels.length === 0}
            onClick={() => setPendingLevels([1, 2, 3])}
          >
            Aplicar 3 níveis no ML
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <th className="py-2 pr-3 font-medium">Nível</th>
                <th className="py-2 pr-3 font-medium text-right">Redução</th>
                <th className="py-2 pr-3 font-medium text-right">Qtd mín.</th>
                <th className="py-2 pr-3 font-medium text-right">
                  Margem (R$)
                </th>
                <th className="py-2 pr-3 font-medium text-right">
                  Preço líquido
                </th>
                <th className="py-2 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => {
                const minQty = displayMinPurchaseUnitForLevel(
                  level.level,
                  wholesaleReductions,
                );
                const canApply =
                  level.suggestedPrice !== null && level.reason === "ok";
                return (
                  <tr
                    key={level.level}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="py-2 pr-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {level.level}
                        {isWholesaleAnchorLevel(level.level) ? (
                          <span className="rounded-full border border-[var(--border)] bg-[var(--muted)]/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                            Âncora
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatFinancialPercent(level.reductionPercent)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {minQty} un
                    </td>
                    <td
                      className="py-2 pr-3 text-right tabular-nums"
                      title={
                        level.targetMarginPercent !== null
                          ? formatFinancialPercent(level.targetMarginPercent)
                          : undefined
                      }
                    >
                      {formatFinancialMoney(level.targetMarginValue)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {level.suggestedPrice !== null ? (
                        <span
                          title={
                            isWholesaleAnchorLevel(level.level)
                              ? `Preço sugerido enviado na âncora ML (1 un.). Pode ser abaixo do varejo (${formatFinancialMoney(row.salePrice)}).`
                              : undefined
                          }
                        >
                          {formatFinancialMoney(level.suggestedPrice)}
                        </span>
                      ) : (
                        <span
                          className="text-[var(--muted-foreground)]"
                          title={wholesalePriceReasonLabel(level.reason)}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={applying || !canApply}
                        onClick={() => setPendingLevels([level.level])}
                      >
                        Aplicar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Nível 1 = âncora ML em 1 un. (preço sugerido). Níveis 2 e 3 = faixas
          de desconto adicionais por quantidade.
        </p>
      </div>

      {pendingLevels ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            aria-hidden
            onClick={() => !applying && setPendingLevels(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg">
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              Aplicar no Mercado Livre
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Confirme os preços líquidos por quantidade que serão enviados para{" "}
              <span className="font-medium text-[var(--foreground)]">
                {row.sku ? ` · SKU ${row.sku}` : row.mlItemId}
              </span>
              .
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {pendingRows.map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
                    item.isAnchor
                      ? "border-[var(--border)] bg-[var(--muted)]/20"
                      : "border-[var(--border)]",
                  )}
                >
                  <span>
                    {item.label} · {item.minPurchaseUnit}
                    {item.isAnchor ? " un" : "+ un"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatFinancialMoney(item.netAmount)}
                  </span>
                </li>
              ))}
            </ul>
            {pendingLevels?.includes(1) ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                O preço sugerido do nível 1 será enviado na âncora ML (1 un.).
              </p>
            ) : null}
            {pendingLevels.length === 3 ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Serão enviados{" "}
                <span className="font-medium text-[var(--foreground)]">
                  3 níveis
                </span>
                : âncora (nível 1) + 2 faixas de desconto.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={applying}
                onClick={() => setPendingLevels(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={applying}
                onClick={() => void applyToMl(pendingLevels)}
              >
                {applying ? "Aplicando…" : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </details>
  );
}

function FinancialDetailModal({
  row,
  targetMarginPercent,
  marginBasis,
  refiningMinPrices,
  minPriceStale,
  wholesaleReductions,
  onClose,
}: {
  row: FinancialEvaluationRow;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  refiningMinPrices?: boolean;
  minPriceStale?: boolean;
  wholesaleReductions: WholesaleReductionSettings;
  onClose: () => void;
}) {
  const labelId = useId();

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id={labelId}
                className="text-lg font-semibold text-[var(--primary)]"
              >
                {row.sku ?? row.title}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {row.mlItemId} · {row.listingTypeLabel ?? "Tipo desconhecido"}
                {row.hasPromotion ? " · em promoção" : ""}
              </p>
              {row.hasPromotion && row.regularPrice != null ? (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Preço de venda: {formatFinancialMoney(row.salePrice)}{" "}
                  <span className="line-through">
                    {formatFinancialMoney(row.regularPrice)}
                  </span>
                </p>
              ) : null}
            </div>
            <Link
              href={row.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
            >
              Ver no ML
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </div>

          {row.errors.length > 0 ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {row.errors.join(" ")}
            </div>
          ) : null}

          {row.warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {row.warnings.join(" ")}
            </div>
          ) : null}

          {row.adsMetricsAvailable ? (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-sm">
              <span className="font-medium">Product Ads</span>
              <span className="text-[var(--muted-foreground)]">
                {" "}
                · últimos {row.adsPeriodDays} dias
                {row.tacosPercent != null
                  ? ` · TACOS ${formatFinancialPercent(row.tacosPercent)}`
                  : ""}
                {row.acosPercent != null
                  ? ` · ACOS ${formatFinancialPercent(row.acosPercent)}`
                  : ""}
                {row.adsCost != null && row.adsCost > 0
                  ? ` · gasto ${formatFinancialMoney(row.adsCost)}`
                  : ""}
                {row.adsCostPerUnit != null && row.adsCostPerUnit > 0
                  ? ` · ${formatFinancialMoney(row.adsCostPerUnit)}/un.`
                  : ""}
              </span>
            </div>
          ) : null}

          <MarginPriceSuggestion
            row={row}
            targetMarginPercent={targetMarginPercent}
            marginBasis={marginBasis}
            productCost={row.productCost}
            extraCosts={row.extraCosts}
            taxRatePercent={row.taxRatePercent}
            refining={refiningMinPrices}
            minPriceStale={minPriceStale}
          />

          <WholesalePricesSection
            row={row}
            wholesaleReductions={wholesaleReductions}
          />

          {row.breakdown ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                    <th className="py-2 pr-4 font-medium">Item</th>
                    <th className="py-2 pr-4 font-medium text-right">Valor</th>
                    <th className="py-2 font-medium text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {row.breakdown.lines.map((line) => (
                    <tr
                      key={line.key}
                      className={cn(
                        "border-b border-[var(--border)]",
                        (line.key === "margin" ||
                          line.key === "marginAfterAds") &&
                          "font-semibold",
                        line.key === "ads" && "text-[var(--muted-foreground)]",
                        line.key === "mlFeeRebate" &&
                          "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      <td className="py-2 pr-4">{line.label}</td>
                      <td className="py-2 pr-4 text-right">
                        {formatFinancialMoney(line.value)}
                      </td>
                      <td className="py-2 text-right">
                        {formatFinancialPercent(line.percentOfSale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-6">
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
              {row.isKitComposition && row.kitComponents ? (
                <>
                  Anúncio &quot;kit&quot; sem SKU próprio — custo e imposto calculados a
                  partir da composição cadastrada em{" "}
                  <Link
                    href="/dashboard/produtos"
                    className="font-medium underline underline-offset-2"
                  >
                    Meus produtos › Kits sem SKU
                  </Link>
                  :{" "}
                  {row.kitComponents
                    .map((c) => `${c.sku} × ${c.quantity}`)
                    .join(", ")}
                  .
                </>
              ) : row.sku ? (
                <>
                  Valores vindos do cadastro em{" "}
                  <Link
                    href="/dashboard/produtos"
                    className="font-medium underline underline-offset-2"
                  >
                    Meus produtos
                  </Link>{" "}
                  (SKU {row.sku}).
                </>
              ) : (
                <>
                  Cadastre o produto em{" "}
                  <Link
                    href="/dashboard/produtos"
                    className="font-medium underline underline-offset-2"
                  >
                    Meus produtos
                  </Link>{" "}
                  com o mesmo SKU do anúncio no ML.
                </>
              )}
            </div>
            <h3 className="text-sm font-semibold">Custos de precificação</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <MaskedMoneyField
                key={`product-cost-${row.mlItemId}`}
                id="product-cost"
                label="Custo de precificação"
                value={row.productCost}
                readOnly
              />
              <MaskedMoneyField
                key={`extra-costs-${row.mlItemId}`}
                id="extra-costs"
                label="Custos extras"
                value={row.extraCosts}
                readOnly
              />
              <div className="relative">
                {row.isKitComposition ? (
                  <PlanningInfoTrigger
                    className="absolute -top-1 right-0"
                    content="Anúncio kit: esta alíquota é a média ponderada dos impostos dos SKUs componentes cadastrados (ponderada pelo custo de cada um)."
                  />
                ) : null}
                <MaskedPercentField
                  key={`tax-rate-${row.mlItemId}`}
                  id="tax-rate"
                  label="Alíquota impostos"
                  value={row.taxRatePercent}
                  readOnly
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
