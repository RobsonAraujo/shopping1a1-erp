"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/shared/ListingStatusBadge";
import { BlurredValue } from "@/components/shared/BlurredValue";
import { PlanningInfoTrigger } from "@/components/shared/PlanningInfoTrigger";
import { SortableTh } from "@/components/ui/sortable-th";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
} from "@/lib/pricing/financial-margin";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import { cn } from "@/lib/utils";
import {
  CatalogBadge,
  ExclusionBadge,
  PmaBadge,
  StackedMarginCell,
  TargetPriceCellView,
  tableCellPad,
  tableHeadPad,
} from "@/components/lucratividade/financial-evaluation-table/shared";
import type { FinancialEvaluationTableProps } from "@/components/lucratividade/financial-evaluation-table/types";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import {
  aggregateProductGroup,
  groupEvaluationRowsByProduct,
  type EvaluationProductGroup,
} from "@/lib/lucratividade/product-groups";
import { listingOptionsSummary } from "@/lib/products/listing-option-label";

export function FinancialEvaluationTableDesktop({
  rows,
  sort,
  onSortChange,
  isSimulation,
  targetMarginPercent,
  marginBasis,
  targetCellFor,
  onSelect,
}: FinancialEvaluationTableProps) {
  // Opções de venda: uma linha por produto, que abre para as opções.
  const groups = useMemo(() => groupEvaluationRowsByProduct(rows), [rows]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function renderListingRow(row: FinancialEvaluationRow, nested: boolean) {
    const excluded = marginExclusionReason(row) !== null;
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
          nested && "bg-[var(--muted)]/15",
        )}
        onClick={() => onSelect(row.mlItemId)}
      >
        <td className={tableCellPad}>
          <div className={cn("flex items-center gap-3", nested && "pl-6")}>
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
            <div className="min-w-0">
              <p className="truncate font-medium" title={row.title}>
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
                <CatalogBadge row={row} />
                <ExclusionBadge row={row} />
                <PmaBadge row={row} isSimulation={isSimulation} />
              </div>
            </div>
          </div>
        </td>
        {isSimulation ? null : (
          <td className={cn(tableCellPad, "text-right")}>
            <div className="font-medium tabular-nums">
              {(row.periodUnitsSold ?? 0).toLocaleString("pt-BR")} un.
            </div>
            <div className="mt-0.5 text-xs tabular-nums text-[var(--muted-foreground)]">
              {formatFinancialMoney(row.periodRevenue ?? null)}
            </div>
          </td>
        )}
        <td className={cn(tableCellPad, "text-right tabular-nums")}>
          {row.pending ? (
            <BlurredValue srLabel="Preço ainda carregando" />
          ) : (
            <>
              <div>{formatFinancialMoney(row.salePrice)}</div>
              {row.hasPromotion && row.regularPrice != null ? (
                <div className="text-xs text-[var(--muted-foreground)] line-through">
                  {formatFinancialMoney(row.regularPrice)}
                </div>
              ) : null}
            </>
          )}
        </td>
        <td className={tableCellPad}>
          <StackedMarginCell
            percent={row.breakdown?.marginPercent ?? null}
            value={row.breakdown?.marginValue ?? null}
            pending={row.pending}
            excluded={excluded}
            excludedNote="fora da média"
          />
        </td>
        <td className={tableCellPad}>
          <StackedMarginCell
            percent={row.marginAfterAdsPercent}
            value={row.marginAfterAdsValue}
            sublabel={tacosSublabel}
            unavailable={!row.adsMetricsAvailable}
            pending={row.pending}
            excluded={excluded}
          />
        </td>
        <td className={cn(tableCellPad, "text-right")}>
          <TargetPriceCellView
            cell={targetCellFor(row)}
            targetMarginPercent={targetMarginPercent}
            marginBasis={marginBasis}
          />
        </td>
      </tr>
    );
    }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className={isSimulation ? "w-[38%]" : "w-[32%]"} />
          {isSimulation ? null : <col className="w-[12%]" />}
          <col className="w-[11%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[14%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <SortableTh
              label="Anúncio"
              sortKey="product"
              sort={sort}
              onSortChange={onSortChange}
              align="left"
              className={tableHeadPad}
            />
            {isSimulation ? null : (
              <SortableTh
                label="Vendas"
                sortKey="sales"
                sort={sort}
                onSortChange={onSortChange}
                className={tableHeadPad}
                hint={
                  <PlanningInfoTrigger content="Unidades vendidas e faturamento do anúncio no período. É o peso dele na média do topo." />
                }
              />
            )}
            <SortableTh
              label={isSimulation ? "Preço hoje" : "Preço médio"}
              sortKey="price"
              sort={sort}
              onSortChange={onSortChange}
              className={tableHeadPad}
            />
            <SortableTh
              label="Margem"
              sortKey="margin"
              sort={sort}
              onSortChange={onSortChange}
              className={tableHeadPad}
              hint={
                <PlanningInfoTrigger content="Margem de contribuição: preço − taxa ML − frete − custo − impostos. Em % do preço e em R$ por unidade." />
              }
            />
            <SortableTh
              label="Após ADS"
              sortKey="afterAds"
              sort={sort}
              onSortChange={onSortChange}
              className={tableHeadPad}
              hint={
                <PlanningInfoTrigger content="Margem de contribuição menos o gasto com Product Ads do anúncio (TACOS = gasto em ADS ÷ faturamento total)." />
              }
            />
            <th className={cn(tableHeadPad, "text-right font-medium")}>
              <span className="inline-flex items-center justify-end gap-1">
                Preço p/ meta
                <PlanningInfoTrigger
                  content={`Menor preço de venda que entrega a meta de ${formatFinancialPercent(targetMarginPercent)} de ${marginBasisLabel(marginBasis)}, comparado ao preço de hoje. "Na meta" = já atinge. Mude a meta no botão Meta.`}
                />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) =>
            group.rows.length === 1 ? (
              renderListingRow(group.rows[0], false)
            ) : (
              <Fragment key={`product:${group.key}`}>
                <ProductGroupRowDesktop
                  group={group}
                  isSimulation={isSimulation}
                  expanded={expanded.has(group.key)}
                  onToggle={() => toggle(group.key)}
                />
                {expanded.has(group.key)
                  ? group.rows.map((row) => renderListingRow(row, true))
                  : null}
              </Fragment>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Linha do produto (opções de venda juntas): vendas somadas e margem ponderada. */
function ProductGroupRowDesktop({
  group,
  isSimulation,
  expanded,
  onToggle,
}: {
  group: EvaluationProductGroup;
  isSimulation: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const agg = aggregateProductGroup(group, isSimulation);
  const lead = agg.lead;
  return (
    <tr
      className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]/30"
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <td className={tableCellPad}>
        <div className="flex items-center gap-3">
          {lead.imageUrl ? (
            <Image
              src={lead.imageUrl}
              alt={lead.title}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="size-10 shrink-0 rounded-md bg-[var(--muted)]" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium" title={lead.title}>
              {lead.sku ?? lead.title}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-[var(--muted-foreground)]">
              <ChevronRight
                className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
                aria-hidden
              />
              {group.rows.length} opções de venda ·{" "}
              {listingOptionsSummary(
                group.rows.map((row) => ({
                  mlItemId: row.mlItemId,
                  listingTypeId: row.listingTypeId,
                  catalogListing: row.catalogListing,
                })),
              )}
            </p>
          </div>
        </div>
      </td>
      {isSimulation ? null : (
        <td className={cn(tableCellPad, "text-right")}>
          <div className="font-medium tabular-nums">{agg.units.toLocaleString("pt-BR")} un.</div>
          <div className="mt-0.5 text-xs tabular-nums text-[var(--muted-foreground)]">
            {formatFinancialMoney(agg.revenue)}
          </div>
        </td>
      )}
      <td className={cn(tableCellPad, "text-right tabular-nums")}>
        {agg.pending && agg.price === null ? (
          <BlurredValue srLabel="Preço ainda carregando" />
        ) : (
          formatFinancialMoney(agg.price)
        )}
      </td>
      <td className={tableCellPad}>
        <StackedMarginCell
          percent={agg.marginPercent}
          value={agg.marginValue}
          pending={agg.pending}
          excluded={agg.allExcluded}
          excludedNote="fora da média"
        />
      </td>
      <td className={tableCellPad}>
        <StackedMarginCell
          percent={agg.afterAdsPercent}
          value={agg.afterAdsValue}
          unavailable={!agg.afterAdsAvailable}
          pending={agg.pending}
          excluded={agg.allExcluded}
        />
      </td>
      <td className={cn(tableCellPad, "text-right text-xs text-[var(--muted-foreground)]")}>
        {expanded ? "por opção ↓" : "abra as opções"}
      </td>
    </tr>
  );
}
