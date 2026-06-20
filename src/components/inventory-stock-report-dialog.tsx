"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, PackagePlus, SlidersHorizontal, X } from "lucide-react";
import type { InventoryRow } from "@/components/inventory-stock-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type MergeDraft = {
  skuKeys: string[];
  anchorSkuKey: string;
  label: string;
  ncm: string;
  editingGroupId: string | null;
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

function hasExtras(extras: StockReportListingExtras): boolean {
  return (
    extras.vendasMesSeguinte > 0 ||
    extras.nfEmitidaNaoEntregue > 0 ||
    extras.estoqueExtra > 0
  );
}

function anchorNcm(
  anchorSkuKey: string,
  productsBySku: Record<string, StockReportProductInfo>,
): string {
  return productsBySku[anchorSkuKey]?.ncm ?? "";
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
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);
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
    () => aggregateStockReportBySku(listings, extrasByMlItemId, productsBySku),
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

  function openMergeDraft(editingGroup?: StockReportMergeGroup) {
    const skuKeys = editingGroup
      ? [...editingGroup.skuKeys]
      : [...selectedSkuKeys].filter((key) =>
          skuPreview.some((row) => row.rowKey === key),
        );
    if (skuKeys.length < 2) return;

    const anchorSkuKey = editingGroup?.anchorSkuKey ?? skuKeys[0] ?? "";
    setMergeDraft({
      skuKeys,
      anchorSkuKey,
      label: editingGroup?.label ?? "",
      ncm:
        editingGroup?.ncmOverride ??
        anchorNcm(anchorSkuKey, productsBySku),
      editingGroupId: editingGroup?.id ?? null,
    });
  }

  function confirmMergeDraft() {
    if (!mergeDraft || mergeDraft.skuKeys.length < 2) return;

    const group: StockReportMergeGroup = {
      id: mergeDraft.editingGroupId ?? `merge-${Date.now()}`,
      skuKeys: mergeDraft.skuKeys,
      anchorSkuKey: mergeDraft.anchorSkuKey,
      label: mergeDraft.label.trim() || undefined,
      ncmOverride: mergeDraft.ncm.trim() || null,
    };

    setMergeGroups((prev) => {
      const withoutEdited = mergeDraft.editingGroupId
        ? prev.filter((g) => g.id !== mergeDraft.editingGroupId)
        : prev;
      return [...withoutEdited, group];
    });
    setMergeDraft(null);
    setSelectedSkuKeys(new Set());
  }

  function undoMerge(mergeId: string) {
    setMergeGroups((prev) => prev.filter((group) => group.id !== mergeId));
  }

  const referenceDate = defaultStockReportReferenceDate();
  const mergeAnchorOptions = mergeDraft
    ? mergeDraft.skuKeys.map((key) => {
        const row = skuPreview.find((r) => r.rowKey === key);
        return { value: key, label: row?.label ?? key };
      })
    : [];

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
              Ajuste o cabeçalho, opcionalmente some unidades extras por anúncio
              e baixe em PDF ou Excel. Nada é salvo no sistema.
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
            <FormInput
              label="Empresa"
              value={header.companyName}
              onChange={(e) =>
                setHeader((prev) => ({
                  ...prev,
                  companyName: e.target.value,
                }))
              }
            />
            <FormInput
              label="Título do relatório"
              value={header.subtitle}
              onChange={(e) =>
                setHeader((prev) => ({ ...prev, subtitle: e.target.value }))
              }
            />
          </section>

          <section>
            <Card
              className={cn(
                "cursor-pointer p-4 transition-colors",
                showExtras
                  ? "border-[var(--primary)] bg-[var(--primary)]/5"
                  : "border-[var(--primary)]/30 hover:border-[var(--primary)]/50",
              )}
              onClick={() => setShowExtras((v) => !v)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                    <SlidersHorizontal className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">
                      Ajustes por anúncio (opcional)
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      Adicione unidades extras ou inclua produtos sem estoque
                      no relatório.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={showExtras}
                  onCheckedChange={setShowExtras}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Mostrar ajustes por anúncio"
                />
              </div>
            </Card>

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
                          const included = total > 0;
                          const zeroBase = base === 0 && !hasExtras(extras);
                          return (
                            <tr
                              key={listing.mlItemId}
                              className={cn(
                                "border-b border-[var(--border)] last:border-0",
                                zeroBase && "bg-[var(--muted)]/30",
                              )}
                            >
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div>
                                    <p className="font-medium">
                                      {listing.sku ?? "Sem SKU"}
                                    </p>
                                    <p className="text-xs text-[var(--muted-foreground)] line-clamp-1">
                                      {listing.title}
                                    </p>
                                  </div>
                                  {included ? (
                                    <Badge variant="default" className="text-[10px]">
                                      Incluído
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px]">
                                      Fora do relatório
                                    </Badge>
                                  )}
                                </div>
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
                                  <FormInput
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
                                    inputClassName="h-8 w-20 tabular-nums"
                                    aria-label={field}
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
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Só entram produtos com estoque total maior que zero.
                </p>
                {report.missingCostCount > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {report.missingCostCount} produto
                    {report.missingCostCount !== 1 ? "s" : ""} sem custo
                    cadastrado — não entram no total.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedSkuKeys.size < 2}
                onClick={() => openMergeDraft()}
              >
                <PackagePlus className="size-4" />
                Agrupar selecionados ({selectedSkuKeys.size})
              </Button>
            </div>

            {mergeDraft ? (
              <Card className="space-y-3 border-[var(--primary)]/40 bg-[var(--primary)]/5 p-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {mergeDraft.editingGroupId
                    ? "Editar grupo"
                    : "Novo grupo de SKUs"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <FormSelect
                    label="SKU âncora"
                    value={mergeDraft.anchorSkuKey}
                    onValueChange={(anchorSkuKey) =>
                      setMergeDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              anchorSkuKey,
                              ncm: prev.ncm || anchorNcm(anchorSkuKey, productsBySku),
                            }
                          : prev,
                      )
                    }
                    options={mergeAnchorOptions}
                  />
                  <FormInput
                    label="Nome do grupo (opcional)"
                    placeholder={
                      mergeAnchorOptions.find(
                        (o) => o.value === mergeDraft.anchorSkuKey,
                      )?.label
                    }
                    value={mergeDraft.label}
                    onChange={(e) =>
                      setMergeDraft((prev) =>
                        prev ? { ...prev, label: e.target.value } : prev,
                      )
                    }
                  />
                  <FormInput
                    label="NCM (opcional)"
                    value={mergeDraft.ncm}
                    onChange={(e) =>
                      setMergeDraft((prev) =>
                        prev ? { ...prev, ncm: e.target.value } : prev,
                      )
                    }
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMergeDraft(null)}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={confirmMergeDraft}>
                    Confirmar grupo
                  </Button>
                </div>
              </Card>
            ) : null}

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
                  {report.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-[var(--muted-foreground)]"
                      >
                        Nenhum produto com estoque para o relatório. Abra os
                        ajustes por anúncio para incluir produtos zerados.
                      </td>
                    </tr>
                  ) : (
                    report.rows.map((row) => {
                      const mergeGroup = mergeGroups.find(
                        (group) => group.id === row.rowKey,
                      );
                      const isMerged = mergeGroup != null;
                      const canSelect =
                        !isMerged &&
                        skuPreview.some(
                          (skuRow) => skuRow.rowKey === row.rowKey,
                        );
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
                            {isMerged && mergeGroup ? (
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openMergeDraft(mergeGroup)}
                                >
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => undoMerge(row.rowKey)}
                                >
                                  Desfazer
                                </Button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {report.rows.length > 0 ? (
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
                ) : null}
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
            disabled={report.rows.length === 0}
            onClick={() =>
              downloadStockReportExcel(header, report, referenceDate)
            }
          >
            <FileSpreadsheet className="size-4" />
            Baixar Excel
          </Button>
          <Button
            type="button"
            disabled={report.rows.length === 0}
            onClick={() =>
              downloadStockReportPdf(header, report, referenceDate)
            }
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" onClick={() => setOpen(true)}>
            <FileDown className="size-4" />
            Gerar Relatório
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Monta o saldo em estoque por SKU e exporta em PDF ou Excel.
        </TooltipContent>
      </Tooltip>
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
