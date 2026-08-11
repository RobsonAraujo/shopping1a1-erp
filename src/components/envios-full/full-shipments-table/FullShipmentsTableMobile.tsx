"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatFinancialMoney } from "@/lib/financial-margin";
import {
  formatShipmentDate,
  sourceLabel,
} from "@/components/envios-full/full-shipments-table/shared";
import type { FullShipmentsTableProps } from "@/components/envios-full/full-shipments-table/types";

export function FullShipmentsTableMobile({
  shipments,
  loading,
  viewMonthName,
  viewYear,
  onEdit,
  onDelete,
}: FullShipmentsTableProps) {
  if (shipments.length === 0) {
    return (
      <Card className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        {loading
          ? "Carregando envios…"
          : `Nenhum envio em ${viewMonthName}/${viewYear}. Importe do faturamento ML ou registre manualmente.`}
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {shipments.map((shipment) => {
        const needsUnits = shipment.totalUnits === 0;
        const needsCost =
          shipment.source === "ml_billing" && shipment.totalCost === 0;
        const inboundLabel = shipment.mlInboundId
          ? shipment.mlInboundId.startsWith("unassigned-")
            ? "—"
            : `N.º ${shipment.mlInboundId}`
          : "—";

        return (
          <li key={shipment.id}>
            <Card className="p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {inboundLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {formatShipmentDate(shipment.shippedAt)} ·{" "}
                    {sourceLabel(shipment.source)}
                  </p>
                </div>
                <Badge variant="muted" className="h-5 shrink-0 px-2 text-[10px]">
                  {shipment.productCount && shipment.productCount > 0
                    ? `${shipment.productCount} produto(s)`
                    : "—"}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    Custo total
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm font-medium tabular-nums">
                    {formatFinancialMoney(shipment.totalCost)}
                    {needsCost ? (
                      <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                        Pendente
                      </Badge>
                    ) : null}
                  </div>
                  {shipment.nonComplianceCost > 0 ? (
                    <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                      Inclui {formatFinancialMoney(shipment.nonComplianceCost)}{" "}
                      de inconformidade
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    Unidades
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm font-medium tabular-nums">
                    {needsUnits ? "—" : shipment.totalUnits}
                    {needsUnits ? (
                      <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                        Completar
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    Custo por unidade
                  </p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {needsUnits
                      ? "—"
                      : `${formatFinancialMoney(shipment.costPerUnit)}/un.`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => onEdit(shipment)}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => onDelete(shipment)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Excluir
                </Button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
