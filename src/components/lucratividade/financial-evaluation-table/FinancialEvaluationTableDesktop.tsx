"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/listing-status-badge";
import {
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
} from "@/lib/financial-margin";
import { cn } from "@/lib/utils";
import {
  MinPriceTableCell,
  SortableTh,
  StackedMarginCell,
  currentSectionClass,
  decisionSectionClass,
  sectionGroupPill,
  tableCellPad,
  tableHeadPad,
} from "@/components/lucratividade/financial-evaluation-table/shared";
import type { FinancialEvaluationTableProps } from "@/components/lucratividade/financial-evaluation-table/types";

export function FinancialEvaluationTableDesktop({
  sortedItems,
  sortKey,
  sortDir,
  onSort,
  isPeriodMode,
  targetMarginPercent,
  marginBasis,
  refiningMinPrices,
  minPriceStale,
  tacosPeriodLabel,
  onSelect,
}: FinancialEvaluationTableProps) {
  return (
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
              <span className={sectionGroupPill("decision")}>Decidir</span>
            </th>
          </tr>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
            <SortableTh
              label="Produto"
              sortKey="product"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className={cn(tableHeadPad)}
            />
            <th className={cn(tableHeadPad, "font-medium")}>Tipo</th>
            <SortableTh
              label="Preço"
              sortKey="price"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
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
              onSort={onSort}
              className={cn(currentSectionClass, tableHeadPad, "text-right")}
              align="right"
              title="Margem de contribuição (% em destaque, R$ abaixo)"
            />
            <SortableTh
              label="Pós ADS"
              sortKey="afterAds"
              activeKey={sortKey}
              activeDir={sortDir}
              onSort={onSort}
              className={cn(currentSectionClass, tableHeadPad, "text-right")}
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
              <tr
                key={row.mlItemId}
                className={cn(
                  "cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]/30",
                  listingRowMutedClass(row.status, 0, 0),
                )}
                onClick={() => onSelect(row.mlItemId)}
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
                        {row.taxRatePercent === null &&
                        row.productCost !== null ? (
                          <Badge
                            variant="warning"
                            title="Imposto não considerado na margem — sem alíquota no relatório tributário. Recalcule em Relatório tributário."
                          >
                            Sem alíquota
                          </Badge>
                        ) : null}
                        {row.pmaPrice !== null &&
                        row.salePrice < row.pmaPrice ? (
                          <Badge
                            variant="destructive"
                            title={`Preço atual (${formatFinancialMoney(row.salePrice)}) abaixo do PMA (${formatFinancialMoney(row.pmaPrice)}).`}
                          >
                            Abaixo do PMA
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-[var(--muted-foreground)]">
                        {row.mlItemId}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={tableCellPad}>{row.listingTypeLabel ?? "—"}</td>
                <td className={cn(tableCellPad, "text-right")}>
                  <div>{formatFinancialMoney(row.salePrice)}</div>
                  {row.hasPromotion && row.regularPrice != null ? (
                    <div className="text-xs text-[var(--muted-foreground)] line-through">
                      {formatFinancialMoney(row.regularPrice)}
                    </div>
                  ) : null}
                </td>
                <td className={cn(currentSectionClass, tableCellPad)}>
                  <StackedMarginCell percent={marginPercent} value={marginValue} />
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
                  className={cn(decisionSectionClass, tableCellPad, "text-right")}
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
  );
}
