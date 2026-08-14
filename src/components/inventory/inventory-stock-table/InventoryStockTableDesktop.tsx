"use client";

import Image from "next/image";
import { Fragment } from "react";
import { HelpCircle, ImageOff, Pencil, Settings } from "lucide-react";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/listing-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { itemListSearchEmptyMessage } from "@/components/item-list-search";
import { SortableTh } from "@/components/ui/sortable-th";
import { cn } from "@/lib/utils";
import type { InventoryStockTableGridProps } from "@/components/inventory/inventory-stock-table/types";
import {
  formatLeadTimeDisplay,
  formatOnTheWayCell,
  onTheWayUnits,
  stockUnits,
} from "@/components/inventory/inventory-stock-table/utils";

function StockColumnHeader({
  label,
  tooltip,
  ariaLabel,
}: {
  label: string;
  tooltip: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span (not button) — this sits inside SortableTh's own <button> */}
          <span
            role="button"
            tabIndex={0}
            className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label={ariaLabel}
            onClick={(e) => e.stopPropagation()}
          >
            <HelpCircle className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

const HEADER_CELL_CLASS =
  "px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";

export function InventoryStockTableDesktop({
  rows,
  filteredRows,
  supplierGroups,
  searchQuery,
  sort,
  onSortChange,
  onEdit,
  onSettings,
}: InventoryStockTableGridProps) {
  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
            <tr>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Produto
              </th>
              <SortableTh
                label={
                  <StockColumnHeader
                    label="Galpão"
                    ariaLabel="Informação sobre estoque no galpão"
                    tooltip="Unidades no nosso galpão, ainda não enviadas ao Mercado Livre."
                  />
                }
                sortKey="warehouseStock"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className={HEADER_CELL_CLASS}
              />
              <SortableTh
                label={
                  <StockColumnHeader
                    label="Já no Full"
                    ariaLabel="Informação sobre estoque já no Full"
                    tooltip="Unidades que já entraram no depósito Full do Mercado Livre e estão disponíveis para venda no anúncio."
                  />
                }
                sortKey="mlStock"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className={HEADER_CELL_CLASS}
              />
              <SortableTh
                label={
                  <StockColumnHeader
                    label="A caminho"
                    ariaLabel="Informação sobre estoque a caminho do Full"
                    tooltip={
                      <>
                        <p>
                          Unidades enviadas ao Full que ainda não estão
                          vendáveis. O número reflete o que a API do Mercado
                          Livre informa: <strong>em transferência</strong> e{" "}
                          <strong>processamento interno</strong>.
                        </p>
                        <p className="mt-2">
                          A <strong>entrada pendente</strong> (envio agendado
                          que ainda não entrou no inventário do ML) aparece no
                          painel do Meli, mas{" "}
                          <strong>não é exposta pela API</strong>— por isso
                          pode ser menor que o &quot;A caminho&quot; do Seller
                          Center.
                        </p>
                      </>
                    }
                  />
                }
                sortKey="onTheWay"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className={HEADER_CELL_CLASS}
              />
              <SortableTh
                label={
                  <StockColumnHeader
                    label="Total"
                    ariaLabel="Informação sobre estoque total"
                    tooltip="Soma de todas as unidades sob nosso controle: galpão + já no Full + a caminho (via API). Pode ser menor que o total do painel Meli quando há entrada pendente."
                  />
                }
                sortKey="totalStock"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className={HEADER_CELL_CLASS}
              />
              <SortableTh
                label={
                  <span className="inline-flex items-center gap-1">
                    Prazo compra
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          aria-label="Informação sobre prazo de compra"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <HelpCircle className="size-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        Tempo entre decidir comprar e o produto chegar no
                        galpão. Usado para planejamento futuro.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                }
                sortKey="leadTimeDays"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className={HEADER_CELL_CLASS}
              />
              <th className={HEADER_CELL_CLASS}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                >
                  {rows.length === 0
                    ? "Nenhum anúncio nesta página."
                    : itemListSearchEmptyMessage(searchQuery)}
                </td>
              </tr>
            ) : (
              supplierGroups.map((group) => (
                <Fragment key={group.supplier}>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                    <td colSpan={7} className="px-4 py-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                        {group.supplier}
                      </span>
                      <span className="ml-2 text-xs font-normal normal-case text-[var(--muted-foreground)]">
                        {group.rows.length} produto
                        {group.rows.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                  </tr>
                  {group.rows.map((row) => {
                    const total =
                      stockUnits(row.warehouseStock) +
                      stockUnits(row.mlStock) +
                      onTheWayUnits(row);
                    const onTheWayCell = formatOnTheWayCell(row);
                    return (
                      <tr
                        key={row.mlItemId}
                        className={cn(
                          "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40",
                          listingRowMutedClass(
                            row.mlStatus,
                            row.mlStock,
                            row.warehouseStock,
                          ),
                        )}
                      >
                        <td className="align-middle px-4 py-3.5">
                          <div className="flex gap-3">
                            <span
                              className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                              aria-hidden
                            >
                              {row.imageUrl ? (
                                <Image
                                  src={row.imageUrl}
                                  alt={row.title}
                                  width={128}
                                  height={128}
                                  className="size-12 object-contain sm:size-14"
                                  sizes="56px"
                                />
                              ) : (
                                <span className="flex size-12 items-center justify-center sm:size-14">
                                  <ImageOff
                                    className="size-5 text-[var(--muted-foreground)]/60"
                                    aria-hidden
                                  />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span
                                  className="block truncate font-semibold leading-snug text-[var(--foreground)]"
                                  title={row.title}
                                >
                                  {row.sku ?? "Sem SKU"}
                                </span>
                                {row.needsPurchaseAttention ? (
                                  <Badge
                                    variant="warning"
                                    className="h-5 px-1.5 text-[10px]"
                                  >
                                    Comprar
                                  </Badge>
                                ) : null}
                              </span>
                              <span
                                className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]"
                                title={row.title}
                              >
                                {row.title}
                              </span>
                              <ListingStatusBadge
                                status={row.mlStatus}
                                mlStock={row.mlStock}
                                warehouseStock={row.warehouseStock}
                              />
                            </span>
                          </div>
                        </td>
                        <td className="align-middle px-4 py-3.5 tabular-nums">
                          {stockUnits(row.warehouseStock)}
                        </td>
                        <td className="align-middle px-4 py-3.5 tabular-nums">
                          {stockUnits(row.mlStock)}
                        </td>
                        <td
                          className={cn(
                            "align-middle px-4 py-3.5 tabular-nums",
                            onTheWayCell.muted &&
                              "text-[var(--muted-foreground)]",
                          )}
                        >
                          {onTheWayCell.showTooltip ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted decoration-[var(--muted-foreground)]/50 underline-offset-2">
                                  {onTheWayCell.display}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-xs"
                              >
                                {onTheWayCell.cellTooltip}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            onTheWayCell.display
                          )}
                        </td>
                        <td className="align-middle px-4 py-3.5 tabular-nums font-medium">
                          {total}
                        </td>
                        <td className="align-middle px-4 py-3.5 tabular-nums text-[var(--muted-foreground)]">
                          {formatLeadTimeDisplay(row.leadTimeDays)}
                        </td>
                        <td className="align-middle px-4 py-3.5">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              className="shrink-0"
                              title="Configurações do anúncio"
                              aria-label="Configurações do anúncio"
                              onClick={() => onSettings(row.mlItemId)}
                            >
                              <Settings className="size-4" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => onEdit(row.mlItemId)}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                              Editar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
