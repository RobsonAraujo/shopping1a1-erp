"use client";

import { useEffect, useMemo, useState } from "react";
import {
  mergeSupplierRevenueIntoRows,
  type PurchaseAnalysisItemRow,
} from "@/lib/purchase-analysis-rows";
import {
  buildPurchaseAnalysisInputFromRow,
  computePurchaseAnalysis,
} from "@/lib/purchase-analysis";
import {
  PurchaseCoverageBufferControl,
  usePurchaseCoverageBufferDays,
} from "@/components/purchase-coverage-buffer";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { SupplierPurchaseAnalysisTable } from "@/components/supplier-purchase-analysis-table";
import { Card, CardContent } from "@/components/ui/card";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type { CalendarMonthLabels } from "@/lib/mercadolibre/revenue-periods";
import {
  formatRevenueBRL,
  getCalendarMonthLabels,
  getCalendarMonthRanges,
  REVENUE_TOOLTIP_HINT,
} from "@/lib/mercadolibre/revenue-periods";
type SupplierPurchaseAnalysisViewProps = {
  rows: PurchaseAnalysisItemRow[];
  supplierParam: string;
};

type RevenueLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      monthLabels: CalendarMonthLabels;
      supplierRevenueLastMonth: number;
      supplierRevenueCurrentMonth: number;
      rowsWithRevenue: PurchaseAnalysisItemRow[];
    };

function recomputeRowsWithBuffer(
  rows: PurchaseAnalysisItemRow[],
  coverageBufferDays: number,
): PurchaseAnalysisItemRow[] {
  return rows.map((row) => ({
    ...row,
    analysis: computePurchaseAnalysis(
      buildPurchaseAnalysisInputFromRow(row, coverageBufferDays),
    ),
  }));
}

const revenueCardClassName =
  "border-violet-500/40 bg-violet-600 text-white shadow-sm";

function RevenueCardSkeleton({ label }: { label: string }) {
  return (
    <Card className={revenueCardClassName}>
      <CardContent className="p-4">
        <p className="text-sm text-violet-100">{label}</p>
        <div
          className="mt-2 h-8 w-32 animate-pulse rounded-md bg-violet-500/60"
          aria-hidden
        />
        <div
          className="mt-2 h-3 w-24 animate-pulse rounded-md bg-violet-500/50"
          aria-hidden
        />
        <span className="sr-only">Carregando faturamento</span>
      </CardContent>
    </Card>
  );
}

export function SupplierPurchaseAnalysisView({
  rows,
  supplierParam,
}: SupplierPurchaseAnalysisViewProps) {
  const { bufferDays, setBufferDays } = usePurchaseCoverageBufferDays();
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchByKey, setFetchByKey] = useState<
    Map<string, Exclude<RevenueLoadState, { status: "loading" }>>
  >(() => new Map());

  const pendingMonthLabels = useMemo(
    () => getCalendarMonthLabels(getCalendarMonthRanges()),
    [],
  );

  const emptyReadyState = useMemo(
    (): Extract<RevenueLoadState, { status: "ready" }> => ({
      status: "ready",
      monthLabels: pendingMonthLabels,
      supplierRevenueLastMonth: 0,
      supplierRevenueCurrentMonth: 0,
      rowsWithRevenue: rows,
    }),
    [pendingMonthLabels, rows],
  );

  const itemIdsKey = useMemo(
    () => rows.map((row) => row.item.id).join(","),
    [rows],
  );

  const requestKey = `${supplierParam}:${itemIdsKey}`;

  useEffect(() => {
    if (rows.length === 0) return;

    let cancelled = false;
    const itemIds = rows.map((row) => row.item.id).join(",");
    const url = `/api/compras/${encodeURIComponent(supplierParam)}/revenue?itemIds=${encodeURIComponent(itemIds)}`;

    fetch(url)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          monthLabels?: CalendarMonthLabels;
          lastMonth?: Record<string, number>;
          currentMonth?: Record<string, number>;
          unitsLastMonth?: Record<string, number>;
          unitsCurrentMonth?: Record<string, number>;
          totals?: {
            lastMonth: number;
            currentMonth: number;
            unitsLastMonth?: number;
            unitsCurrentMonth?: number;
          };
        };
        if (!res.ok) {
          throw new Error(
            data.error ?? "Não foi possível carregar faturamento",
          );
        }
        if (cancelled) return;

        const rowsWithRevenue = mergeSupplierRevenueIntoRows(
          rows,
          data.lastMonth ?? {},
          data.currentMonth ?? {},
          data.unitsLastMonth ?? {},
          data.unitsCurrentMonth ?? {},
        );

        setFetchByKey((prev) => {
          const next = new Map(prev);
          next.set(requestKey, {
            status: "ready",
            monthLabels: data.monthLabels ?? pendingMonthLabels,
            supplierRevenueLastMonth: data.totals?.lastMonth ?? 0,
            supplierRevenueCurrentMonth: data.totals?.currentMonth ?? 0,
            rowsWithRevenue,
          });
          return next;
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFetchByKey((prev) => {
          const next = new Map(prev);
          next.set(requestKey, {
            status: "error",
            message:
              e instanceof Error
                ? e.message
                : "Não foi possível carregar faturamento",
          });
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [supplierParam, itemIdsKey, requestKey, rows, pendingMonthLabels]);

  const revenueState: RevenueLoadState =
    rows.length === 0
      ? emptyReadyState
      : (fetchByKey.get(requestKey) ?? { status: "loading" });

  const baseRows =
    revenueState.status === "ready" ? revenueState.rowsWithRevenue : rows;

  const computedRows = useMemo(
    () => recomputeRowsWithBuffer(baseRows, bufferDays),
    [baseRows, bufferDays],
  );

  const filteredRows = useMemo(
    () =>
      filterByItemListSearch(computedRows, searchQuery, (row) => ({
        sku: row.sku,
        title: row.item.title,
        mlItemId: row.item.id,
        extra: [row.categoryName, row.categoryPath],
      })),
    [computedRows, searchQuery],
  );

  const urgentCount = computedRows.filter(
    (r) => r.analysis.purchaseStatus === "urgente",
  ).length;
  const highRotationCount = computedRows.filter(
    (r) => r.analysis.performanceTier === "alta",
  ).length;
  const noSalesCount = computedRows.filter(
    (r) => r.analysis.performanceTier === "zero",
  ).length;
  const suggestedUnitsTotal = computedRows
    .filter((r) => r.analysis.recommendation === "comprar")
    .reduce((sum, r) => sum + r.analysis.suggestedQty, 0);

  const revenueMonthLabels =
    revenueState.status === "ready"
      ? revenueState.monthLabels
      : pendingMonthLabels;

  return (
    <div className="space-y-6">
      <PurchaseCoverageBufferControl
        bufferDays={bufferDays}
        onBufferDaysChange={setBufferDays}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Á Comprar</p>
            <p className="text-2xl font-bold tabular-nums text-rose-900">
              {urgentCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Boa rotação
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {highRotationCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Sem vendas</p>
            <p className="text-2xl font-bold tabular-nums">{noSalesCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Un. sugeridas
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {suggestedUnitsTotal}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {revenueState.status === "loading" ? (
          <>
            <RevenueCardSkeleton
              label={`Faturamento — ${revenueMonthLabels.lastMonth}`}
            />
            <RevenueCardSkeleton
              label={`Faturamento — ${revenueMonthLabels.currentMonth}`}
            />
          </>
        ) : revenueState.status === "error" ? (
          <Card className="sm:col-span-2 border-amber-200/80 bg-amber-50/50">
            <CardContent className="p-4 text-sm text-amber-950">
              {revenueState.message}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className={revenueCardClassName} title={REVENUE_TOOLTIP_HINT}>
              <CardContent className="p-4">
                <p className="text-sm text-violet-100">
                  Faturamento — {revenueState.monthLabels.lastMonth}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {formatRevenueBRL(revenueState.supplierRevenueLastMonth)}
                </p>
                <p className="mt-1 text-xs text-violet-200/90">
                  Bruto via Mercado Livre
                </p>
              </CardContent>
            </Card>
            <Card className={revenueCardClassName} title={REVENUE_TOOLTIP_HINT}>
              <CardContent className="p-4">
                <p className="text-sm text-violet-100">
                  Faturamento — {revenueState.monthLabels.currentMonth}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {formatRevenueBRL(revenueState.supplierRevenueCurrentMonth)}
                </p>
                <p className="mt-1 text-xs text-violet-200/90">
                  Bruto via Mercado Livre
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <ItemListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        filteredCount={filteredRows.length}
        totalCount={computedRows.length}
      />

      <SupplierPurchaseAnalysisTable
        rows={filteredRows}
        emptyMessage={itemListSearchEmptyMessage(searchQuery)}
      />
    </div>
  );
}
