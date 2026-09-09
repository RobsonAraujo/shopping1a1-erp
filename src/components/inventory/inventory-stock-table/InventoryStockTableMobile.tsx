"use client";

import Image from "next/image";
import { useMemo, useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ImageOff, Pencil, Settings } from "lucide-react";
import {
  ListingStatusBadge,
  listingRowMutedClass,
} from "@/components/shared/ListingStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { itemListSearchEmptyMessage } from "@/components/shared/ItemListSearch";
import { cn } from "@/lib/utils";
import type {
  InventoryRow,
  InventoryStockTableGridProps,
  SupplierGroup,
} from "@/components/inventory/inventory-stock-table/types";
import {
  BlurredValue,
  formatLeadTimeDisplay,
  onTheWayUnits,
  stockUnits,
} from "@/components/inventory/inventory-stock-table/utils";

const GROUP_HEADER_HEIGHT = 32;
const CARD_HEIGHT = 220;

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

function StatBlock({
  label,
  value,
  muted,
  emphasis,
  pending,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
  pending?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 tabular-nums text-sm",
          emphasis ? "font-semibold" : "font-medium",
          muted && "text-[var(--muted-foreground)]",
        )}
      >
        {pending ? (
          <BlurredValue srLabel={`${label} ainda carregando`} />
        ) : (
          value
        )}
      </p>
    </div>
  );
}

function GroupHeaderRow({
  supplier,
  count,
}: {
  supplier: string;
  count: number;
}) {
  return (
    <div className="flex items-baseline gap-2 px-1 pt-1 pb-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
        {supplier}
      </span>
      <span className="text-xs text-[var(--muted-foreground)]">
        {count} produto{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function ProductCard({
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

  return (
    <div className="px-1 pb-3">
      <Card
        className={cn(
          "p-4 shadow-sm",
          listingRowMutedClass(row.mlStatus, row.mlStock, row.warehouseStock),
        )}
      >
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
                className="size-14 object-contain"
                sizes="56px"
              />
            ) : (
              <span className="flex size-14 items-center justify-center">
                <ImageOff
                  className="size-5 text-[var(--muted-foreground)]/60"
                  aria-hidden
                />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="block truncate font-semibold leading-snug text-[var(--foreground)]"
                title={row.title}
              >
                {row.sku ?? "Sem SKU"}
              </span>
              {row.fulfillmentPending ? (
                <Badge
                  variant="warning"
                  className="h-5 shrink-0 px-1.5 text-[10px] blur-[3px] select-none"
                  aria-hidden="true"
                >
                  Comprar
                </Badge>
              ) : row.needsPurchaseAttention ? (
                <Badge variant="warning" className="h-5 shrink-0 px-1.5 text-[10px]">
                  Comprar
                </Badge>
              ) : null}
            </div>
            <p
              className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--muted-foreground)]"
              title={row.title}
            >
              {row.title}
            </p>
            <ListingStatusBadge
              status={row.mlStatus}
              mlStock={row.mlStock}
              warehouseStock={row.warehouseStock}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-3">
          <StatBlock label="Galpão" value={String(stockUnits(row.warehouseStock))} />
          <StatBlock label="Já no Full" value={String(stockUnits(row.mlStock))} />
          <StatBlock
            label="A caminho"
            value={row.isFulfillment ? String(onTheWayUnits(row)) : "—"}
            muted={!row.isFulfillment}
            pending={row.fulfillmentPending}
          />
          <StatBlock
            label="Total"
            value={String(total)}
            emphasis
            pending={row.fulfillmentPending}
          />
          <StatBlock
            label="Prazo compra"
            value={formatLeadTimeDisplay(row.leadTimeDays)}
            muted
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => onSettings(row.mlItemId)}
          >
            <Settings className="size-3.5" aria-hidden />
            Configurações
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => onEdit(row.mlItemId)}
          >
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function InventoryStockTableMobile({
  rows,
  filteredRows,
  supplierGroups,
  searchQuery,
  onEdit,
  onSettings,
}: InventoryStockTableGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const flatItems = useMemo(() => flattenGroups(supplierGroups), [supplierGroups]);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      flatItems[index]?.type === "header" ? GROUP_HEADER_HEIGHT : CARD_HEIGHT,
    overscan: 6,
  });

  if (filteredRows.length === 0) {
    return (
      <Card className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        {rows.length === 0
          ? "Nenhum anúncio nesta página."
          : itemListSearchEmptyMessage(searchQuery)}
      </Card>
    );
  }

  return (
    <div ref={parentRef} className="max-h-[75vh] overflow-y-auto">
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
                <ProductCard row={item.row} onEdit={onEdit} onSettings={onSettings} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
