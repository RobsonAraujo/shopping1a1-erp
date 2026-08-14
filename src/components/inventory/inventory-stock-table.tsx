"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  ShowPausedListingsSwitch,
  countPausedListings,
  filterListingsByPausedVisibility,
} from "@/components/show-paused-listings-switch";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ItemListSearch } from "@/components/item-list-search";
import { groupBySkuSupplier } from "@/lib/mercadolibre/item-sku";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type { StockReportProductInfo } from "@/lib/inventory/inventory-stock-report";
import { InventoryStockReportLauncher } from "@/components/inventory/inventory-stock-report-dialog";
import { InventoryStockTableGrid } from "@/components/inventory/inventory-stock-table/index";
import type { InventorySortKey } from "@/components/inventory/inventory-stock-table/types";
import { getInventorySortValue } from "@/components/inventory/inventory-stock-table/utils";
import { useTableSort } from "@/hooks/use-table-sort";

const MAX_LEAD_DAYS = 365;

export type InventoryRow = {
  mlItemId: string;
  sku: string | null;
  title: string;
  imageUrl?: string;
  mlStatus: string;
  mlStock: number;
  warehouseStock: number;
  isFulfillment: boolean;
  catalogListing: boolean;
  mlStockOnTheWay: number;
  mlProcessTransfer: number;
  mlProcessInternal: number;
  leadTimeDays: number | null;
  needsPurchaseAttention: boolean;
};

type InventoryStockTableProps = {
  rows: InventoryRow[];
  productsBySku: Record<string, StockReportProductInfo>;
};

function leadTimeToForm(days: number | null): {
  value: string;
  unit: "weeks" | "days";
} {
  if (days === null || days === 0) return { value: "", unit: "weeks" };
  if (days % 7 === 0) return { value: String(days / 7), unit: "weeks" };
  return { value: String(days), unit: "days" };
}

export function InventoryStockTable({
  rows,
  productsBySku,
}: InventoryStockTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showPaused, setShowPaused] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const statusVisibleRows = useMemo(
    () =>
      filterListingsByPausedVisibility(rows, showPaused, (row) => row.mlStatus),
    [rows, showPaused],
  );
  const pausedCount = useMemo(
    () => countPausedListings(rows, (row) => row.mlStatus),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      filterByItemListSearch(statusVisibleRows, searchQuery, (row) => ({
        sku: row.sku,
        title: row.title,
        mlItemId: row.mlItemId,
      })),
    [statusVisibleRows, searchQuery],
  );
  const editing = editId
    ? (rows.find((r) => r.mlItemId === editId) ?? null)
    : null;
  const settingsRow = settingsId
    ? (rows.find((r) => r.mlItemId === settingsId) ?? null)
    : null;
  const supplierGroups = useMemo(
    () => groupBySkuSupplier(filteredRows, (row) => row.sku),
    [filteredRows],
  );

  const { sort, onSortChange } = useTableSort<InventoryRow, InventorySortKey>(
    filteredRows,
    getInventorySortValue,
    { key: "needsPurchaseAttention", direction: "desc" },
  );

  const sortedSupplierGroups = useMemo(
    () =>
      supplierGroups.map((group) => {
        const dir = sort.direction === "asc" ? 1 : -1;
        return {
          supplier: group.supplier,
          rows: [...group.rows].sort(
            (a, b) =>
              dir *
              (getInventorySortValue(a, sort.key) -
                getInventorySortValue(b, sort.key)),
          ),
        };
      }),
    [supplierGroups, sort],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <InventoryStockReportLauncher
            rows={rows}
            productsBySku={productsBySku}
          />
          <ShowPausedListingsSwitch
            checked={showPaused}
            onCheckedChange={setShowPaused}
            pausedCount={pausedCount}
            disabled={rows.length === 0}
          />
        </div>
        <ItemListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          filteredCount={filteredRows.length}
          totalCount={statusVisibleRows.length}
        />
        <InventoryStockTableGrid
          rows={rows}
          filteredRows={filteredRows}
          supplierGroups={sortedSupplierGroups}
          searchQuery={searchQuery}
          sort={sort}
          onSortChange={onSortChange}
          onEdit={setEditId}
          onSettings={setSettingsId}
        />

        {editing ? (
          <WarehouseEditModal
            row={editing}
            onClose={() => setEditId(null)}
            onSaved={() => {
              setEditId(null);
              router.refresh();
            }}
          />
        ) : null}

        {settingsRow ? (
          <LeadTimeSettingsModal
            key={settingsRow.mlItemId}
            row={settingsRow}
            onClose={() => setSettingsId(null)}
            onSaved={() => {
              setSettingsId(null);
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function WarehouseEditModal({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(row.warehouseStock));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const n = parseInt(value, 10);
    if (!Number.isInteger(n) || n < 0) {
      setError("Informe um número inteiro maior ou igual a zero.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(row.mlItemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: n }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={true}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Estoque no galpão</SheetTitle>
          <SheetDescription>
            Ajuste apenas a quantidade física no galpão. O estoque no Mercado
            Livre vem da API do ML e não é alterado aqui.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {row.sku ?? "Sem SKU"}
            </p>
            <p
              className="text-xs text-[var(--muted-foreground)] line-clamp-2"
              title={row.title}
            >
              {row.title}
            </p>
          </div>

          <label
            htmlFor="warehouse-qty"
            className="mt-4 block text-sm font-medium text-[var(--foreground)]"
          >
            Quantidade no galpão
          </label>
          <input
            id="warehouse-qty"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:h-10 sm:text-sm"
          />

          {error ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Confirmar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function LeadTimeSettingsModal({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = leadTimeToForm(row.leadTimeDays);
  const [value, setValue] = useState(initial.value);
  const [unit, setUnit] = useState<"weeks" | "days">(initial.unit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const i = leadTimeToForm(row.leadTimeDays);
    setValue(i.value);
    setUnit(i.unit);
  }, [row.mlItemId, row.leadTimeDays]);

  async function submit() {
    const trimmed = value.trim();
    let purchaseLeadTimeDays: number | null;
    if (trimmed === "") {
      purchaseLeadTimeDays = null;
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isInteger(n) || n < 0) {
        setError("Informe um número inteiro maior ou igual a zero.");
        return;
      }
      const days = unit === "weeks" ? n * 7 : n;
      if (days > MAX_LEAD_DAYS) {
        setError(`O prazo total não pode passar de ${MAX_LEAD_DAYS} dias.`);
        return;
      }
      purchaseLeadTimeDays = days;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(row.mlItemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: row.warehouseStock,
            purchaseLeadTimeDays,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={true}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Configurações do anúncio</SheetTitle>
          <SheetDescription>
            Ajuste o tempo entre decidir a compra e o produto chegar no
            galpão.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {row.sku ?? "Sem SKU"}
            </p>
            <p
              className="text-xs text-[var(--muted-foreground)] line-clamp-2"
              title={row.title}
            >
              {row.title}
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="lead-time-value"
                className="text-sm font-medium text-[var(--foreground)]"
              >
                Prazo até o galpão
              </label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex cursor-pointer rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    aria-label="O que é este prazo?"
                  >
                    <HelpCircle className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  Tempo desde que você decide comprar até a mercadoria chegar
                  no galpão. O valor é salvo em dias (se escolher semanas,
                  convertemos automaticamente).
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="lead-time-value"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="Ex.: 2"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:h-10 sm:text-sm"
              />
              <FormSelect
                id="lead-time-unit"
                aria-label="Unidade do prazo"
                value={unit}
                onValueChange={(value) =>
                  setUnit(value === "weeks" ? "weeks" : "days")
                }
                options={[
                  { value: "weeks", label: "Semanas" },
                  { value: "days", label: "Dias" },
                ]}
                triggerClassName="w-[8.5rem]"
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Informe em semanas ou em dias; o sistema grava em dias para
              cálculos futuros. Deixe em branco para remover o prazo.
            </p>
          </div>

          {error ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Confirmar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
