"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, X } from "lucide-react";
import type { InventoryRow } from "@/components/inventory-stock-table";
import { Button } from "@/components/ui/button";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { downloadStockReportExcel } from "@/lib/inventory-stock-report-excel";
import { downloadStockReportPdf } from "@/lib/inventory-stock-report-pdf";
import {
  aggregateStockReportBySku,
  buildDefaultStockReportHeader,
  buildStockReportRows,
  defaultStockReportReferenceDate,
  formatStockReportCurrency,
  formatStockReportUnits,
  inventoryBaseUnits,
  listingTotalUnits,
  type StockReportListingExtras,
  type StockReportMergeGroup,
  type StockReportProductInfo,
} from "@/lib/inventory-stock-report";
import { cn } from "@/lib/utils";

const EMPTY_EXTRAS: StockReportListingExtras = {
  vendasMesSeguinte: 0,
  nfEmitidaNaoEntregue: 0,
  estoqueExtra: 0,
};

type InventoryStockReportDialogProps = {
  rows: InventoryRow[];
  productsBySku: Record<string, StockReportProductInfo>;
  onClose: () => void;
};

function parseOptionalUnits(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

function extrasFor(
  map: Record<string, StockReportListingExtras>,
  mlItemId: string,
): StockReportListingExtras {
  return map[mlItemId] ?? EMPTY_EXTRAS;
}

export function InventoryStockReportDialog({
  rows,
  productsBySku,
  onClose,
}: InventoryStockReportDialogProps) {
  const titleId = useId();
  const [header, setHeader] = useState(buildDefaultStockReportHeader);
  const [extrasByMlItemId, setExtrasByMlItemId] = useState<
    Record<string, StockReportListingExtras>
  >({});
  const [mergeGroups, setMergeGroups] = useState<StockReportMergeGroup[]>([]);
  const [selectedSkuKeys, setSelectedSkuKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [mergeLabel, setMergeLabel] = useState("");
  const [listingSearch, setListingSearch] = useState("");
  const [showExtras, setShowExtras] = useState(false);

  const listings = useMemo(
    () =>
      rows.map((row) => ({
        mlItemId: row.mlItemId,
        sku: row.sku,
        title: row.title,
        mlStock: row.mlStock,
        warehouseStock: row.warehouseStock,
        mlStockOnTheWay: row.mlStockOnTheWay,
      })),
    [rows],
  );

  const filteredListings = useMemo(
    () =>
      filterByItemListSearch(listings, listingSearch, (row) => ({
        sku: row.sku,
        title: row.title,
        mlItemId: row.mlItemId,
      })),
    [listings, listingSearch],
  );

  const skuPreview = useMemo(
    () =>
      aggregateStockReportBySku(
        listings,
        extrasByMlItemId,
        productsBySku,
      ),
    [listings, extrasByMlItemId, productsBySku],
  );

  const report = useMemo(
    () =>
      buildStockReportRows(
        listings,
        extrasByMlItemId,
        productsBySku,
        mergeGroups,
      ),
    [listings, extrasByMlItemId, productsBySku, mergeGroups],
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function updateExtra(
    mlItemId: string,
    field: keyof StockReportListingExtras,
    value: string,
  ) {
    setExtrasByMlItemId((prev) => ({
      ...prev,
      [mlItemId]: {
        ...extrasFor(prev, mlItemId),
        [field]: parseOptionalUnits(value),
      },
    }));
  }

  function toggleSkuSelection(rowKey: string) {
    setSelectedSkuKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }

  function handleMergeSelected() {
    const skuKeys = [...selectedSkuKeys].filter((key) =>
      skuPreview.some((row) => row.rowKey === key),
    );
    if (skuKeys.length < 2) return;

    const id = `merge-${Date.now()}`;
    setMergeGroups((prev) => [
      ...prev,
      {
        id,
        skuKeys,
        label: mergeLabel.trim() || undefined,
      },
    ]);
    setSelectedSkuKeys(new Set());
    setMergeLabel("");
  }

  function undoMerge(mergeId: string) {
    setMergeGroups((prev) => prev.filter((group) => group.id !== mergeId));
  }

  const referenceDate = defaultStockReportReferenceDate();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold text-[var(--primary)]"
            >
              Saldo em estoque
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Ajuste o cabeçalho, opcionalmente some unidades extras por
              anúncio e baixe em PDF ou Excel. Nada é salvo no sistema.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-[var(--foreground)]">
                Empresa
              </span>
              <input
                type="text"
                value={header.companyName}
                onChange={(e) =>
                  setHeader((prev) => ({
                    ...prev,
                    companyName: e.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-[var(--foreground)]">
                Título do relatório
              </span>
              <input
                type="text"
                value={header.subtitle}
                onChange={(e) =>
                  setHeader((prev) => ({ ...prev, subtitle: e.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </label>
          </section>

          <section>
            <button
              type="button"
              className="text-sm font-semibold text-[var(--primary)] hover:underline"
              onClick={() => setShowExtras((v) => !v)}
            >
              {showExtras ? "Ocultar" : "Mostrar"} ajustes por anúncio
            </button>
            {showExtras ? (
              <div className="mt-3 space-y-3">
                <ItemListSearch
                  value={listingSearch}
                  onChange={setListingSearch}
                  filteredCount={filteredListings.length}
                  totalCount={listings.length}
                />
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full min-w-[48rem] text-left text-sm">
                    <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      <tr>
                        <th className="px-3 py-2.5">Anúncio</th>
                        <th className="px-3 py-2.5">Base</th>
                        <th className="px-3 py-2.5">Vendas mês sequente</th>
                        <th className="px-3 py-2.5">NF emitida não entregue</th>
                        <th className="px-3 py-2.5">Estoque extra</th>
                        <th className="px-3 py-2.5">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredListings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 py-6 text-center text-[var(--muted-foreground)]"
                          >
                            {itemListSearchEmptyMessage(listingSearch)}
                          </td>
                        </tr>
                      ) : (
                        filteredListings.map((listing) => {
                          const extras = extrasFor(
                            extrasByMlItemId,
                            listing.mlItemId,
                          );
                          const base = inventoryBaseUnits(listing);
                          const total = listingTotalUnits(listing, extras);
                          return (
                            <tr
                              key={listing.mlItemId}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="px-3 py-2">
                                <p className="font-medium">
                                  {listing.sku ?? "Sem SKU"}
                                </p>
                                <p className="text-xs text-[var(--muted-foreground)] line-clamp-1">
                                  {listing.title}
                                </p>
                              </td>
                              <td className="px-3 py-2 tabular-nums">{base}</td>
                              {(
                                [
                                  "vendasMesSeguinte",
                                  "nfEmitidaNaoEntregue",
                                  "estoqueExtra",
                                ] as const
                              ).map((field) => (
                                <td key={field} className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={extras[field] || ""}
                                    onChange={(e) =>
                                      updateExtra(
                                        listing.mlItemId,
                                        field,
                                        e.target.value,
                                      )
                                    }
                                    className="w-20 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm tabular-nums"
                                  />
                                </td>
                              ))}
                              <td className="px-3 py-2 tabular-nums font-medium">
                                {total}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Prévia do relatório (por SKU)
                </h3>
                {report.missingCostCount > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {report.missingCostCount} produto
                    {report.missingCostCount !== 1 ? "s" : ""} sem custo
                    cadastrado — não entram no total.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="sr-only">Nome do grupo</span>
                  <input
                    type="text"
                    placeholder="Nome do grupo (opcional)"
                    value={mergeLabel}
                    onChange={(e) => setMergeLabel(e.target.value)}
                    className="w-48 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedSkuKeys.size < 2}
                  onClick={handleMergeSelected}
                >
                  Agrupar selecionados ({selectedSkuKeys.size})
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  <tr>
                    <th className="w-10 px-3 py-2.5" />
                    <th className="px-3 py-2.5">Produto (SKU)</th>
                    <th className="px-3 py-2.5">NCM</th>
                    <th className="px-3 py-2.5">Custo unit.</th>
                    <th className="px-3 py-2.5">Unidades</th>
                    <th className="px-3 py-2.5">Valor</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => {
                    const isMerged = mergeGroups.some(
                      (group) => group.id === row.rowKey,
                    );
                    const canSelect =
                      !isMerged &&
                      skuPreview.some((skuRow) => skuRow.rowKey === row.rowKey);
                    return (
                      <tr
                        key={row.rowKey}
                        className={cn(
                          "border-b border-[var(--border)] last:border-0",
                          row.missingCost && "bg-amber-50/40",
                        )}
                      >
                        <td className="px-3 py-2">
                          {canSelect ? (
                            <input
                              type="checkbox"
                              checked={selectedSkuKeys.has(row.rowKey)}
                              onChange={() => toggleSkuSelection(row.rowKey)}
                              aria-label={`Selecionar ${row.label}`}
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.ncm ?? "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.unitCost != null
                            ? formatStockReportCurrency(row.unitCost)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatStockReportUnits(row.units)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.stockValue != null
                            ? formatStockReportCurrency(row.stockValue)
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {isMerged ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => undoMerge(row.rowKey)}
                            >
                              Desfazer
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--muted)]/50 font-semibold">
                    <td colSpan={5} className="px-3 py-3 text-right">
                      Valor Total em Estoque
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatStockReportCurrency(report.totalValue)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadStockReportExcel(header, report, referenceDate)
            }
          >
            <FileSpreadsheet className="size-4" />
            Baixar Excel
          </Button>
          <Button
            type="button"
            onClick={() => downloadStockReportPdf(header, report, referenceDate)}
          >
            <FileDown className="size-4" />
            Baixar PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

type InventoryStockReportLauncherProps = {
  rows: InventoryRow[];
  productsBySku: Record<string, StockReportProductInfo>;
};

export function InventoryStockReportLauncher({
  rows,
  productsBySku,
}: InventoryStockReportLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileDown className="size-4" />
        Saldo em estoque
      </Button>
      {open ? (
        <InventoryStockReportDialog
          rows={rows}
          productsBySku={productsBySku}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
