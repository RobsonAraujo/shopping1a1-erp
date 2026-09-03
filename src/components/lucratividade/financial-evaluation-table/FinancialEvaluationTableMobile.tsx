"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/shared/ListingStatusBadge";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
} from "@/lib/pricing/financial-margin";
import { cn } from "@/lib/utils";
import {
  MinPriceTableCell,
  StackedMarginCell,
} from "@/components/lucratividade/financial-evaluation-table/shared";
import type { FinancialEvaluationTableProps } from "@/components/lucratividade/financial-evaluation-table/types";

export function FinancialEvaluationTableMobile({
  sortedItems,
  isPeriodMode,
  targetMarginPercent,
  marginBasis,
  refiningMinPrices,
  minPriceStale,
  tacosPeriodLabel,
  onSelect,
}: FinancialEvaluationTableProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[var(--muted-foreground)]">
        Meta: {formatFinancialPercent(targetMarginPercent)} (
        {marginBasisLabel(marginBasis)}) · Pós ADS: TACOS {tacosPeriodLabel}
      </p>
      <ul className="space-y-3">
        {sortedItems.map((row) => {
          const marginValue = row.breakdown?.marginValue ?? null;
          const marginPercent = row.breakdown?.marginPercent ?? null;
          const afterAdsPercent = row.marginAfterAdsPercent;
          const afterAdsValue = row.marginAfterAdsValue;
          const tacosSublabel =
            row.adsMetricsAvailable &&
            row.tacosPercent != null &&
            row.tacosPercent > 0
              ? `TACOS ${formatFinancialPercent(row.tacosPercent)}`
              : null;
          return (
            <li key={row.mlItemId}>
              <Card
                className={cn(
                  "cursor-pointer p-4 shadow-sm transition-colors active:bg-[var(--muted)]/30",
                  listingRowMutedClass(row.status, 0, 0),
                )}
                onClick={() => onSelect(row.mlItemId)}
              >
                <div className="flex items-start gap-3">
                  {row.imageUrl ? (
                    <Image
                      src={row.imageUrl}
                      alt={row.title}
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="size-10 shrink-0 rounded-md bg-[var(--muted)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {row.sku ?? row.title}
                      </p>
                      <ListingStatusBadge
                        status={row.status}
                        mlStock={0}
                        warehouseStock={0}
                      />
                    </div>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {row.mlItemId} · {row.listingTypeLabel ?? "—"}
                    </p>
                    {row.taxRatePercent === null && row.productCost !== null ? (
                      <Badge
                        variant="warning"
                        className="mt-1"
                        title="Imposto não considerado na margem — sem alíquota no relatório tributário. Recalcule em Relatório tributário."
                      >
                        Sem alíquota
                      </Badge>
                    ) : null}
                    {row.pmaPrice !== null && row.salePrice < row.pmaPrice ? (
                      <Badge
                        variant="destructive"
                        className="mt-1"
                        title={`Preço atual (${formatFinancialMoney(row.salePrice)}) abaixo do PMA (${formatFinancialMoney(row.pmaPrice)}).`}
                      >
                        Abaixo do PMA
                      </Badge>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium">
                      {formatFinancialMoney(row.salePrice)}
                    </div>
                    {row.hasPromotion && row.regularPrice != null ? (
                      <div className="text-xs text-[var(--muted-foreground)] line-through">
                        {formatFinancialMoney(row.regularPrice)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      Margem
                    </p>
                    <div className="mt-0.5">
                      <StackedMarginCell
                        percent={marginPercent}
                        value={marginValue}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      Pós ADS
                    </p>
                    <div className="mt-0.5">
                      <StackedMarginCell
                        percent={afterAdsPercent}
                        value={afterAdsValue}
                        sublabel={tacosSublabel}
                        unavailable={!row.adsMetricsAvailable}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      P/ meta
                    </p>
                    <div className="mt-0.5 text-right">
                      <MinPriceTableCell
                        row={row}
                        targetMarginPercent={targetMarginPercent}
                        marginBasis={marginBasis}
                        refining={refiningMinPrices && !isPeriodMode}
                        showProportionalWhileStale={minPriceStale}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
