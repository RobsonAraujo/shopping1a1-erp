import { useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  computeFinancialMargin,
  computeMarginAfterAds,
  computeMinSalePriceForTargetMargin,
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
  type MarginBasis,
  type MinSalePriceResult,
} from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { cn } from "@/lib/utils";
import type { SortDir, SortKey } from "@/components/lucratividade/financial-evaluation-table/types";

export const currentSectionClass = "bg-[var(--muted)]/10";

export const decisionSectionClass =
  "border-l border-sky-200/90 bg-sky-50/50 px-2 dark:border-sky-800/80 dark:bg-sky-950/25";

export const tableCellPad = "px-3 py-3";
export const tableHeadPad = "px-3 py-2";

export function sectionGroupPill(variant: "current" | "decision") {
  return cn(
    "inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
    variant === "current"
      ? "bg-[var(--muted)]/40 text-[var(--muted-foreground)]"
      : "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  );
}

export type CostOverrides = {
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
};

export type MinPriceSuggestion = MinSalePriceResult & {
  refined?: boolean;
};

export type MinPricesApiResponse = {
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

export function resolveMinPriceSuggestion(
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

export function marginTone(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) {
    return "text-[var(--muted-foreground)]";
  }
  if (margin > 0) return "text-emerald-600";
  if (margin < 0) return "text-rose-600";
  return "text-[var(--muted-foreground)]";
}

export function StackedMarginCell({
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

export function MinPriceCellSkeleton() {
  return (
    <div
      className="ml-auto h-4 w-16 animate-pulse rounded bg-sky-200/80 dark:bg-sky-800/50"
      aria-hidden
    />
  );
}

export function MinPriceTableCell({
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

export function SortableTh({
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
