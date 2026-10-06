"use client";

import Image from "next/image";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/shared/ListingStatusBadge";
import { BlurredValue } from "@/components/shared/BlurredValue";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/pricing/financial-margin";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import { cn } from "@/lib/utils";
import {
  ExclusionBadge,
  PmaBadge,
  StackedMarginCell,
  TargetPriceCellView,
} from "@/components/lucratividade/financial-evaluation-table/shared";
import type {
  FinancialEvaluationTableProps,
  SortKey,
} from "@/components/lucratividade/financial-evaluation-table/types";

const SORT_OPTIONS: Array<{ value: string; label: string; key: SortKey; dir: "asc" | "desc"; periodOnly?: boolean }> = [
  { value: "sales-desc", label: "Mais vendidos", key: "sales", dir: "desc", periodOnly: true },
  { value: "margin-asc", label: "Menor margem", key: "margin", dir: "asc" },
  { value: "margin-desc", label: "Maior margem", key: "margin", dir: "desc" },
  { value: "afterAds-asc", label: "Menor margem após ADS", key: "afterAds", dir: "asc" },
  { value: "product-asc", label: "Produto (A–Z)", key: "product", dir: "asc" },
];

export function FinancialEvaluationTableMobile({
  rows,
  sort,
  onSortSet,
  isSimulation,
  targetMarginPercent,
  marginBasis,
  targetCellFor,
  onSelect,
}: FinancialEvaluationTableProps) {
  const options = SORT_OPTIONS.filter((option) => !(isSimulation && option.periodOnly));
  const current =
    options.find(
      (option) => option.key === sort.key && option.dir === sort.direction,
    )?.value ?? "";

  return (
    <div className="space-y-3">
      <FormSelect
        aria-label="Ordenar anúncios"
        value={current}
        placeholder="Ordenar por…"
        options={options.map(({ value, label }) => ({ value, label }))}
        onValueChange={(value) => {
          const option = options.find((o) => o.value === value);
          if (option) onSortSet({ key: option.key, direction: option.dir });
        }}
      />
      <ul className="space-y-3">
        {rows.map((row) => {
          const excluded = marginExclusionReason(row) !== null;
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
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {row.sku ?? row.title}
                    </p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {row.mlItemId}
                      {row.listingTypeLabel ? ` · ${row.listingTypeLabel}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <ListingStatusBadge
                        status={row.status}
                        mlStock={0}
                        warehouseStock={0}
                      />
                      <ExclusionBadge row={row} />
                      <PmaBadge row={row} isSimulation={isSimulation} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {row.pending ? (
                      <BlurredValue srLabel="Preço ainda carregando" />
                    ) : (
                      <>
                        <div className="text-sm font-medium tabular-nums">
                          {formatFinancialMoney(row.salePrice)}
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">
                          {isSimulation ? "hoje" : "preço médio"}
                        </div>
                        {isSimulation ? null : (
                          <div className="mt-0.5 text-xs tabular-nums text-[var(--muted-foreground)]">
                            {(row.periodUnitsSold ?? 0).toLocaleString("pt-BR")} un. ·{" "}
                            {formatFinancialMoney(row.periodRevenue ?? null)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      Margem
                    </p>
                    <div className="mt-0.5">
                      <StackedMarginCell
                        percent={row.breakdown?.marginPercent ?? null}
                        value={row.breakdown?.marginValue ?? null}
                        pending={row.pending}
                        excluded={excluded}
                        excludedNote="fora da média"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      Após ADS
                    </p>
                    <div className="mt-0.5">
                      <StackedMarginCell
                        percent={row.marginAfterAdsPercent}
                        value={row.marginAfterAdsValue}
                        sublabel={tacosSublabel}
                        unavailable={!row.adsMetricsAvailable}
                        pending={row.pending}
                        excluded={excluded}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      Preço p/ meta
                    </p>
                    <div className="mt-0.5 text-right">
                      <TargetPriceCellView
                        cell={targetCellFor(row)}
                        targetMarginPercent={targetMarginPercent}
                        marginBasis={marginBasis}
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
