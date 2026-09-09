"use client";

import Image from "next/image";
import { useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  HelpCircle,
  ImageOff,
  Pencil,
  Settings,
} from "lucide-react";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/shared/ListingStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { itemListSearchEmptyMessage } from "@/components/shared/ItemListSearch";
import type { TableSort } from "@/components/ui/sortable-th";
import { cn } from "@/lib/utils";
import type {
  InventoryRow,
  InventorySortKey,
  InventoryStockTableGridProps,
  SupplierGroup,
} from "@/components/inventory/inventory-stock-table/types";
import {
  formatLeadTimeDisplay,
  formatOnTheWayCell,
  onTheWayUnits,
  stockUnits,
} from "@/components/inventory/inventory-stock-table/utils";
import { BlurredValue } from "@/components/shared/BlurredValue";

/**
 * Grid CSS em vez de `<table>` — necessário pra virtualizar (`position:
 * absolute` não se comporta de forma confiável dentro de `<tbody>`/`<tr>`
 * entre navegadores). Mesmo padrão já usado em TaxReportTransactionTable.
 * Header e linhas compartilham este template pra alinhar as colunas.
 */
const GRID_COLS = "minmax(18rem,1fr) 6rem 7rem 7rem 6rem 8rem 11rem";
const TABLE_MIN_WIDTH = "63rem";
const GROUP_HEADER_HEIGHT = 41;
const DATA_ROW_HEIGHT = 81;

type FlatItem =
  | { type: "header"; supplier: string; count: number }
  | { type: "row"; row: InventoryRow };

function flattenGroups(groups: SupplierGroup[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const group of groups) {
    items.push({
      type: "header",
      supplier: group.supplier,
      count: group.rows.length,
    });
    for (const row of group.rows) {
      items.push({ type: "row", row });
    }
  }
  return items;
}

function SortTrigger({
  label,
  sortKey,
  sort,
  onSortChange,
}: {
  label: ReactNode;
  sortKey: InventorySortKey;
  sort: TableSort<InventorySortKey>;
  onSortChange: (key: InventorySortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSortChange(sortKey)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 hover:text-[var(--foreground)]",
        active && "text-[var(--foreground)]",
      )}
    >
      {label}
      <Icon className="size-3" />
    </button>
  );
}

function StockColumnHeader({
  label,
  tooltip,
  ariaLabel,
}: {
  label: string;
  tooltip: ReactNode;
  ariaLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span (not button) — sits inside SortTrigger's own <button> */}
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
const GRID_ROW_CLASS = "grid w-full items-center";

function GroupHeaderRow({
  supplier,
  count,
}: {
  supplier: string;
  count: number;
}) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--muted)]/50 px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
        {supplier}
      </span>
      <span className="ml-2 text-xs font-normal normal-case text-[var(--muted-foreground)]">
        {count} produto{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function DataRow({
  row,
  onEdit,
  onSettings,
}: {
  row: InventoryRow;
  onEdit: (mlItemId: string) => void;
  onSettings: (mlItemId: string) => void;
}) {
  const total =
    stockUnits(row.warehouseStock) + stockUnits(row.mlStock) + onTheWayUnits(row);
  const onTheWayCell = formatOnTheWayCell(row);

  return (
    <div
      className={cn(
        GRID_ROW_CLASS,
        "border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]/40",
        listingRowMutedClass(row.mlStatus, row.mlStock, row.warehouseStock),
      )}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      <div className="px-4 py-3.5">
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
              {row.fulfillmentPending ? (
                <Badge
                  variant="warning"
                  className="h-5 px-1.5 text-[10px] blur-[3px] select-none"
                  aria-hidden="true"
                >
                  Comprar
                </Badge>
              ) : row.needsPurchaseAttention ? (
                <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
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
      </div>
      <div className="px-4 py-3.5 tabular-nums">{stockUnits(row.warehouseStock)}</div>
      <div className="px-4 py-3.5 tabular-nums">{stockUnits(row.mlStock)}</div>
      <div
        className={cn(
          "px-4 py-3.5 tabular-nums",
          onTheWayCell.muted && "text-[var(--muted-foreground)]",
        )}
      >
        {row.fulfillmentPending ? (
          <BlurredValue srLabel="Estoque Full a caminho ainda carregando" />
        ) : onTheWayCell.showTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted decoration-[var(--muted-foreground)]/50 underline-offset-2">
                {onTheWayCell.display}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {onTheWayCell.cellTooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          onTheWayCell.display
        )}
      </div>
      <div className="px-4 py-3.5 tabular-nums font-medium">
        {row.fulfillmentPending ? (
          <BlurredValue srLabel="Total em estoque ainda carregando" />
        ) : (
          total
        )}
      </div>
      <div className="px-4 py-3.5 tabular-nums text-[var(--muted-foreground)]">
        {formatLeadTimeDisplay(row.leadTimeDays)}
      </div>
      <div className="px-4 py-3.5">
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
      </div>
    </div>
  );
}

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
  const parentRef = useRef<HTMLDivElement>(null);
  const flatItems = useMemo(() => flattenGroups(supplierGroups), [supplierGroups]);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      flatItems[index]?.type === "header" ? GROUP_HEADER_HEIGHT : DATA_ROW_HEIGHT,
    overscan: 8,
  });

  if (filteredRows.length === 0) {
    return (
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
          {rows.length === 0
            ? "Nenhum anúncio nesta página."
            : itemListSearchEmptyMessage(searchQuery)}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: TABLE_MIN_WIDTH }}>
          <div
            className={cn(
              GRID_ROW_CLASS,
              "border-b border-[var(--border)] bg-[var(--muted)]/80",
            )}
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <span className={HEADER_CELL_CLASS}>Produto</span>
            <span className={HEADER_CELL_CLASS}>
              <SortTrigger
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
              />
            </span>
            <span className={HEADER_CELL_CLASS}>
              <SortTrigger
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
              />
            </span>
            <span className={HEADER_CELL_CLASS}>
              <SortTrigger
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
              />
            </span>
            <span className={HEADER_CELL_CLASS}>
              <SortTrigger
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
              />
            </span>
            <span className={HEADER_CELL_CLASS}>
              <SortTrigger
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
              />
            </span>
            <span className={HEADER_CELL_CLASS}>Ações</span>
          </div>

          <div
            ref={parentRef}
            className="max-h-[70vh] overflow-x-hidden overflow-y-auto"
          >
            <div
              style={
                {
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: "relative",
                } satisfies CSSProperties
              }
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const item = flatItems[virtualItem.index];
                if (!item) return null;
                const key =
                  item.type === "header"
                    ? `header:${item.supplier}`
                    : `row:${item.row.mlItemId}`;
                return (
                  <div
                    key={key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    {item.type === "header" ? (
                      <GroupHeaderRow supplier={item.supplier} count={item.count} />
                    ) : (
                      <DataRow row={item.row} onEdit={onEdit} onSettings={onSettings} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
