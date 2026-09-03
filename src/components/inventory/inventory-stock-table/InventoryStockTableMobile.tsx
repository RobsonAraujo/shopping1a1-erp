"use client";

import Image from "next/image";
import { Fragment } from "react";
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
import type { InventoryStockTableGridProps } from "@/components/inventory/inventory-stock-table/types";
import {
  formatLeadTimeDisplay,
  onTheWayUnits,
  stockUnits,
} from "@/components/inventory/inventory-stock-table/utils";

function StatBlock({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
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
        {value}
      </p>
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
    <div className="space-y-4">
      {supplierGroups.map((group) => (
        <Fragment key={group.supplier}>
          <div className="flex items-baseline gap-2 px-1 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
              {group.supplier}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {group.rows.length} produto
              {group.rows.length !== 1 ? "s" : ""}
            </span>
          </div>

          <ul className="space-y-3">
            {group.rows.map((row) => {
              const total =
                stockUnits(row.warehouseStock) +
                stockUnits(row.mlStock) +
                onTheWayUnits(row);

              return (
                <li key={row.mlItemId}>
                  <Card
                    className={cn(
                      "p-4 shadow-sm",
                      listingRowMutedClass(
                        row.mlStatus,
                        row.mlStock,
                        row.warehouseStock,
                      ),
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
                          {row.needsPurchaseAttention ? (
                            <Badge
                              variant="warning"
                              className="h-5 shrink-0 px-1.5 text-[10px]"
                            >
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
                      <StatBlock
                        label="Galpão"
                        value={String(stockUnits(row.warehouseStock))}
                      />
                      <StatBlock
                        label="Já no Full"
                        value={String(stockUnits(row.mlStock))}
                      />
                      <StatBlock
                        label="A caminho"
                        value={
                          row.isFulfillment ? String(onTheWayUnits(row)) : "—"
                        }
                        muted={!row.isFulfillment}
                      />
                      <StatBlock label="Total" value={String(total)} emphasis />
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
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}
