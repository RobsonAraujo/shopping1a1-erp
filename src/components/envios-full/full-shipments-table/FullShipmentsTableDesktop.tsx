"use client";

import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SortableTh } from "@/components/ui/sortable-th";
import { formatFinancialMoney } from "@/lib/financial-margin";
import {
  formatShipmentDate,
  sourceLabel,
} from "@/components/envios-full/full-shipments-table/shared";
import type { FullShipmentsTableViewProps } from "@/components/envios-full/full-shipments-table/types";

export function FullShipmentsTableDesktop({
  shipments,
  loading,
  viewMonthName,
  viewYear,
  onEdit,
  onDelete,
  sort,
  onSortChange,
}: FullShipmentsTableViewProps) {
  return (
    <TooltipProvider delayDuration={200}>
    <Card className="overflow-hidden p-0 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
            <tr>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Envio ML
              </th>
              <SortableTh
                label="Data"
                sortKey="shippedAt"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
              />
              <SortableTh
                label="Produtos"
                sortKey="productCount"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
              />
              <SortableTh
                label="Custo total"
                sortKey="totalCost"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
              />
              <SortableTh
                label="Unidades"
                sortKey="totalUnits"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
              />
              <SortableTh
                label="Custo/un."
                sortKey="costPerUnit"
                sort={sort}
                onSortChange={onSortChange}
                align="left"
                className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
              />
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Origem
              </th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                >
                  {loading
                    ? "Carregando envios…"
                    : `Nenhum envio em ${viewMonthName}/${viewYear}. Importe do faturamento ML ou registre manualmente.`}
                </td>
              </tr>
            ) : (
              shipments.map((shipment) => {
                const needsUnits = shipment.totalUnits === 0;
                const needsCost =
                  shipment.source === "ml_billing" && shipment.totalCost === 0;
                const inboundLabel = shipment.mlInboundId
                  ? shipment.mlInboundId.startsWith("unassigned-")
                    ? "—"
                    : `N.º ${shipment.mlInboundId}`
                  : "—";
                return (
                  <tr
                    key={shipment.id}
                    className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40"
                  >
                    <td className="px-4 py-3.5 tabular-nums font-medium">
                      {inboundLabel}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      {formatShipmentDate(shipment.shippedAt)}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      {shipment.productCount && shipment.productCount > 0
                        ? shipment.productCount
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {formatFinancialMoney(shipment.totalCost)}
                        {shipment.nonComplianceCost > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                <AlertTriangle className="size-3" aria-hidden />
                                Inconform.
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Inclui {formatFinancialMoney(shipment.nonComplianceCost)}{" "}
                              de cobrança por inconformidade (INBOUND_PENALTY/OVERAGE).
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        {needsCost ? (
                          <Badge
                            variant="warning"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            Custo pendente
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      <span className="inline-flex items-center gap-2">
                        {needsUnits ? "—" : shipment.totalUnits}
                        {needsUnits ? (
                          <Badge
                            variant="warning"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            Completar unidades
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-medium">
                      {needsUnits
                        ? "—"
                        : `${formatFinancialMoney(shipment.costPerUnit)}/un.`}
                    </td>
                    <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                      {sourceLabel(shipment.source)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => onEdit(shipment)}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          title="Excluir envio"
                          aria-label="Excluir envio"
                          onClick={() => onDelete(shipment)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
    </TooltipProvider>
  );
}
