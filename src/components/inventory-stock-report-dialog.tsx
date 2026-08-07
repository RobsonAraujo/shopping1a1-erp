"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Info,
  Loader2,
  PackagePlus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { InventoryRow } from "@/components/inventory-stock-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
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
  defaultStockReportSnapshotDate,
  formatStockReportCurrency,
  formatStockReportSnapshotDateInput,
  formatStockReportSubtitle,
  formatStockReportUnits,
  inventoryBaseUnits,
  listingAuditBreakdown,
  listingStateFor,
  parseStockReportSnapshotDateInput,
  skuKeyFromListing,
  type StockReportListingInput,
  type StockReportListingState,
  type StockReportMergeGroup,
  type StockReportProductInfo,
  type StockReportRow,
} from "@/lib/inventory-stock-report";
import { cn } from "@/lib/utils";

type ManualListingAdjustments = {
  nfEmitidaNaoEntregue: number;
  ajusteManual: number;
};

const EMPTY_MANUAL: ManualListingAdjustments = {
  nfEmitidaNaoEntregue: 0,
  ajusteManual: 0,
};

type SalesAdjustmentResponse = {
  period: { from: string; to: string } | null;
  salesByMlItemId: Record<string, number>;
  catalogSnapshotByMlItemId: Record<
    string,
    { mlStock: number; snapshotAt: string }
  >;
  dateField: string;
  includeCancelled?: boolean;
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

function parseNonNegativeUnits(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

function parseSignedUnits(value: string): number {
  if (!value.trim()) return 0;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n)) return 0;
  return n;
}

function manualFor(
  map: Record<string, ManualListingAdjustments>,
  mlItemId: string,
): ManualListingAdjustments {
  return map[mlItemId] ?? EMPTY_MANUAL;
}

function hasManualAdjustments(manual: ManualListingAdjustments): boolean {
  return manual.nfEmitidaNaoEntregue !== 0 || manual.ajusteManual !== 0;
}

function formatSnapshotBadgeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPeriodDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function countPeriodDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.max(1, Math.ceil((to - from) / (24 * 60 * 60 * 1000)));
}

function MemoriaLinha({
  label,
  value,
  nota,
  destaque,
  fraca,
}: {
  label: string;
  value: string;
  nota?: string;
  destaque?: boolean;
  fraca?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", fraca && "opacity-70")}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
        <span
          className={cn(
            "shrink-0 tabular-nums",
            destaque
              ? "font-semibold text-[var(--foreground)]"
              : "text-[var(--foreground)]",
          )}
        >
          {value}
        </span>
      </div>
      {nota ? (
        <span className="self-end text-[10px] text-[var(--muted-foreground)]/80">
          {nota}
        </span>
      ) : null}
    </div>
  );
}

function MemoriaDivider() {
  return <div className="my-1.5 border-t border-dashed border-[var(--border)]" />;
}

function SkuCalculationMemory({
  row,
  memberListings,
  listingStatesByMlItemId,
  salesPeriod,
  snapshotDateInput,
}: {
  row: StockReportRow;
  memberListings: StockReportListingInput[];
  listingStatesByMlItemId: Record<string, StockReportListingState>;
  salesPeriod: { from: string; to: string } | null;
  snapshotDateInput: string;
}) {
  const snapshotDateLabel = snapshotDateInput.split("-").reverse().join("/");
  const periodDays = salesPeriod
    ? countPeriodDays(salesPeriod.from, salesPeriod.to)
    : 0;

  return (
    <div className="max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Memória de cálculo — {row.label}
      </p>

      {memberListings.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Nenhum anúncio ativo encontrado para este produto na listagem atual.
        </p>
      ) : (
        memberListings.map((listing, index) => {
          const state = listingStateFor(
            listingStatesByMlItemId,
            listing.mlItemId,
          );
          const audit = listingAuditBreakdown(listing, state);
          const usesCatalogSnapshot = audit.mlStockSource === "catalog_snapshot";

          return (
            <div
              key={listing.mlItemId}
              className={cn(index > 0 && "mt-3 border-t border-[var(--border)] pt-3")}
            >
              {memberListings.length > 1 ? (
                <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">
                  Anúncio: {listing.sku ?? "Sem SKU"}{" "}
                  <span className="font-normal text-[var(--muted-foreground)]">
                    — {listing.title}
                  </span>
                </p>
              ) : null}

              <MemoriaLinha
                label="Estoque no galpão"
                value={String(audit.warehouseStock)}
                nota="dado atual, direto do cadastro de estoque"
              />
              <MemoriaLinha
                label={
                  usesCatalogSnapshot
                    ? "Estoque no Mercado Livre (na data)"
                    : "Estoque no Mercado Livre (hoje)"
                }
                value={String(
                  usesCatalogSnapshot ? audit.mlStockAtSnapshot : audit.mlStockToday,
                )}
                nota={
                  usesCatalogSnapshot && audit.snapshotAt
                    ? `snapshot de catálogo de ${formatSnapshotBadgeTime(audit.snapshotAt)} (hoje seria ${audit.mlStockToday})`
                    : "dado atual do Mercado Livre"
                }
              />
              <MemoriaLinha
                label="Estoque a caminho (Full)"
                value={String(audit.mlStockOnTheWay)}
                nota="dado atual"
              />

              {usesCatalogSnapshot ? (
                <MemoriaLinha
                  label="Vendas no período"
                  value="não se aplica"
                  nota="este anúncio usa o estoque ML real do dia (snapshot) em vez de descontar vendas"
                  fraca
                />
              ) : (
                <MemoriaLinha
                  label="+ Vendas feitas depois da data escolhida"
                  value={`+${audit.salesAfterSnapshot}`}
                  nota={
                    salesPeriod
                      ? `pedidos pagos entre ${formatPeriodDate(salesPeriod.from)} e ${formatPeriodDate(salesPeriod.to)} (${periodDays} dia${periodDays !== 1 ? "s" : ""}) — já saíram do estoque, por isso somamos de volta`
                      : "sem período de vendas a somar (data escolhida é hoje ou no futuro)"
                  }
                />
              )}
              <MemoriaLinha
                label="+ NF emitida não entregue"
                value={`+${audit.nfEmitidaNaoEntregue}`}
                nota={
                  audit.nfEmitidaNaoEntregue === 0
                    ? "não informado"
                    : "informado manualmente em Ajustes por anúncio"
                }
                fraca={audit.nfEmitidaNaoEntregue === 0}
              />
              <MemoriaLinha
                label={audit.ajusteManual >= 0 ? "+ Ajuste manual" : "− Ajuste manual"}
                value={`${audit.ajusteManual >= 0 ? "+" : ""}${audit.ajusteManual}`}
                nota={
                  audit.ajusteManual === 0
                    ? "não informado"
                    : "informado manualmente em Ajustes por anúncio"
                }
                fraca={audit.ajusteManual === 0}
              />
              <MemoriaDivider />
              <MemoriaLinha
                label={`Estoque deste anúncio em ${snapshotDateLabel}`}
                value={String(audit.total)}
                destaque
              />
            </div>
          );
        })
      )}

      <MemoriaDivider />

      {memberListings.length > 1 ? (
        <MemoriaLinha
          label={`Soma de ${memberListings.length} anúncios`}
          value={formatStockReportUnits(row.units)}
          destaque
        />
      ) : (
        <MemoriaLinha
          label="Unidades no relatório"
          value={formatStockReportUnits(row.units)}
          destaque
        />
      )}

      <MemoriaDivider />
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Valorização
      </p>
      {row.unitCost != null ? (
        <MemoriaLinha
          label="Unidades × Custo unitário"
          value={formatStockReportCurrency(row.stockValue ?? 0)}
          nota={`${formatStockReportUnits(row.units)} × ${formatStockReportCurrency(row.unitCost)}`}
          destaque
        />
      ) : (
        <MemoriaLinha
          label="Valor em estoque"
          value="—"
          nota="produto sem custo cadastrado — não entra no valor total do relatório"
          fraca
        />
      )}
    </div>
  );
}

export function InventoryStockReportDialog({
  rows,
  productsBySku,
  onClose,
}: InventoryStockReportDialogProps) {
  const titleId = useId();
  const defaultSnapshotDate = defaultStockReportSnapshotDate();
  const [header, setHeader] = useState(buildDefaultStockReportHeader);
  const [subtitleEdited, setSubtitleEdited] = useState(false);
  const [snapshotDateInput, setSnapshotDateInput] = useState(() =>
    formatStockReportSnapshotDateInput(defaultSnapshotDate),
  );
  const [manualByMlItemId, setManualByMlItemId] = useState<
    Record<string, ManualListingAdjustments>
  >({});
  const [salesByMlItemId, setSalesByMlItemId] = useState<
    Record<string, number>
  >({});
  const [catalogSnapshotByMlItemId, setCatalogSnapshotByMlItemId] = useState<
    SalesAdjustmentResponse["catalogSnapshotByMlItemId"]
  >({});
  const [salesPeriod, setSalesPeriod] = useState<
    SalesAdjustmentResponse["period"]
  >(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [mergeGroups, setMergeGroups] = useState<StockReportMergeGroup[]>([]);
  const [selectedSkuKeys, setSelectedSkuKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);
  const [listingSearch, setListingSearch] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [includeCancelledSales, setIncludeCancelledSales] = useState(false);
  const [expandedSkuRowKey, setExpandedSkuRowKey] = useState<string | null>(
    null,
  );

  const snapshotDate = useMemo(
    () => parseStockReportSnapshotDateInput(snapshotDateInput),
    [snapshotDateInput],
  );

  const listings = useMemo(
    () =>
      rows.map((row) => ({
        mlItemId: row.mlItemId,
        sku: row.sku,
        title: row.title,
        mlStock: row.mlStock,
        warehouseStock: row.warehouseStock,
        mlStockOnTheWay: row.mlStockOnTheWay,
        catalogListing: row.catalogListing,
      })),
    [rows],
  );

  const listingsBySkuKey = useMemo(() => {
    const map = new Map<string, (typeof listings)[number][]>();
    for (const listing of listings) {
      const key = skuKeyFromListing(listing.sku, listing.mlItemId);
      const arr = map.get(key);
      if (arr) arr.push(listing);
      else map.set(key, [listing]);
    }
    return map;
  }, [listings]);

  const listingStatesByMlItemId = useMemo(() => {
    const map: Record<string, StockReportListingState> = {};
    for (const listing of listings) {
      const manual = manualFor(manualByMlItemId, listing.mlItemId);
      const catalogSnap = catalogSnapshotByMlItemId[listing.mlItemId];
      const snapshotSource =
        listing.catalogListing && catalogSnap
          ? {
              kind: "catalog_snapshot" as const,
              mlStockAtSnapshot: catalogSnap.mlStock,
              snapshotAt: catalogSnap.snapshotAt,
            }
          : { kind: "sales" as const };

      map[listing.mlItemId] = {
        adjustment: {
          salesAfterSnapshot: salesByMlItemId[listing.mlItemId] ?? 0,
          nfEmitidaNaoEntregue: manual.nfEmitidaNaoEntregue,
          ajusteManual: manual.ajusteManual,
        },
        snapshotSource,
      };
    }
    return map;
  }, [listings, manualByMlItemId, salesByMlItemId, catalogSnapshotByMlItemId]);

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
        listingStatesByMlItemId,
        productsBySku,
      ),
    [listings, listingStatesByMlItemId, productsBySku],
  );

  const report = useMemo(
    () =>
      buildStockReportRows(
        listings,
        listingStatesByMlItemId,
        productsBySku,
        mergeGroups,
      ),
    [listings, listingStatesByMlItemId, productsBySku, mergeGroups],
  );

  const catalogItemIds = useMemo(
    () =>
      listings
        .filter((listing) => listing.catalogListing)
        .map((listing) => listing.mlItemId),
    [listings],
  );

  const fetchSalesAdjustment = useCallback(async () => {
    if (!snapshotDateInput || listings.length === 0) return;

    setSalesLoading(true);
    setSalesError(null);
    try {
      const params = new URLSearchParams({
        snapshot: snapshotDateInput,
        itemIds: listings.map((l) => l.mlItemId).join(","),
      });
      if (catalogItemIds.length > 0) {
        params.set("catalogItemIds", catalogItemIds.join(","));
      }
      if (includeCancelledSales) {
        params.set("includeCancelled", "true");
      }

      const res = await fetch(
        `/api/inventory/stock-report/sales-adjustment?${params.toString()}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }

      const data = (await res.json()) as SalesAdjustmentResponse;
      setSalesByMlItemId(data.salesByMlItemId ?? {});
      setCatalogSnapshotByMlItemId(data.catalogSnapshotByMlItemId ?? {});
      setSalesPeriod(data.period ?? null);
    } catch (e) {
      setSalesError(e instanceof Error ? e.message : "Erro ao buscar vendas");
      setSalesByMlItemId({});
      setCatalogSnapshotByMlItemId({});
      setSalesPeriod(null);
    } finally {
      setSalesLoading(false);
    }
  }, [snapshotDateInput, listings, catalogItemIds, includeCancelledSales]);

  useEffect(() => {
    void fetchSalesAdjustment();
  }, [fetchSalesAdjustment]);

  useEffect(() => {
    if (subtitleEdited || !snapshotDate) return;
    setHeader((prev) => ({
      ...prev,
      subtitle: formatStockReportSubtitle(snapshotDate),
    }));
  }, [snapshotDate, subtitleEdited]);

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

  function updateManual(
    mlItemId: string,
    field: keyof ManualListingAdjustments,
    value: string,
  ) {
    setManualByMlItemId((prev) => ({
      ...prev,
      [mlItemId]: {
        ...manualFor(prev, mlItemId),
        [field]:
          field === "ajusteManual"
            ? parseSignedUnits(value)
            : parseNonNegativeUnits(value),
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
      ncm: editingGroup?.ncmOverride ?? anchorNcm(anchorSkuKey, productsBySku),
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

  const referenceDate = snapshotDate ?? defaultStockReportSnapshotDate();
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
              Estime o saldo em uma data passada: estoque de hoje + vendas ML
              depois da data (ou snapshot de catálogo). Nada é salvo no sistema.
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
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
            <p>
              O valor do produto usado neste relatório é o mesmo{" "}
              <strong className="text-[var(--foreground)]">
                Custo de precificação
              </strong>{" "}
              mostrado em{" "}
              <span className="font-medium text-[var(--foreground)]">
                Meus produtos
              </span>
              : Custo unitário NF (ou o custo de compra com{" "}
              <strong className="text-[var(--foreground)]">ICMS-ST</strong>,
              quando o produto tiver essa marcação) somado ao IPI cadastrado.
              Produtos sem esse custo cadastrado aparecem como valor faltante.
            </p>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DatePicker
              label="Data do saldo"
              valueYmd={snapshotDateInput}
              onChange={setSnapshotDateInput}
            />
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
              onChange={(e) => {
                setSubtitleEdited(true);
                setHeader((prev) => ({ ...prev, subtitle: e.target.value }));
              }}
            />
          </section>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
            <Switch
              id={`${titleId}-include-cancelled`}
              checked={includeCancelledSales}
              onCheckedChange={setIncludeCancelledSales}
              aria-label="Incluir vendas canceladas"
            />
            <label
              htmlFor={`${titleId}-include-cancelled`}
              className="cursor-pointer text-sm text-[var(--foreground)]"
            >
              Incluir vendas canceladas no ajuste automático
            </label>
            <p className="text-xs text-[var(--muted-foreground)] sm:ml-auto">
              {includeCancelledSales
                ? "Somando todos os pedidos no período, inclusive cancelados."
                : "Padrão: exclui apenas pedidos cancelados."}
            </p>
          </div>

          {salesLoading ? (
            <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Buscando vendas ML e snapshots de catálogo…
            </p>
          ) : null}
          {salesError ? (
            <p className="text-sm text-red-600">{salesError}</p>
          ) : null}

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
                      NF emitida, ajuste manual (+/−) e transparência do cálculo
                      por anúncio.
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
                <p className="text-xs text-[var(--muted-foreground)]">
                  Estimativa: estoque de hoje + vendas ML depois da data escolhida.
                  Não inclui entradas Full/galpão automáticas — use Ajuste manual.
                  Para catálogo com snapshot, galpão e a caminho usam o estoque
                  atual. A memória de cálculo completa por produto está na
                  prévia do relatório, mais abaixo.
                </p>
                {salesPeriod ? (
                  <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    Período de vendas somado de volta ao estoque:{" "}
                    <strong className="text-[var(--foreground)]">
                      {formatPeriodDate(salesPeriod.from)} até{" "}
                      {formatPeriodDate(salesPeriod.to)}
                    </strong>{" "}
                    (
                    {countPeriodDays(salesPeriod.from, salesPeriod.to)} dia
                    {countPeriodDays(salesPeriod.from, salesPeriod.to) !== 1
                      ? "s"
                      : ""}
                    ) — pedidos pagos nesse intervalo são somados de volta ao
                    estoque de hoje para estimar o estoque na data escolhida.
                  </p>
                ) : (
                  <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    A data escolhida é hoje ou no futuro — nenhuma venda é
                    somada de volta, o estoque na data é o estoque atual.
                  </p>
                )}
                <ItemListSearch
                  value={listingSearch}
                  onChange={setListingSearch}
                  filteredCount={filteredListings.length}
                  totalCount={listings.length}
                />
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full min-w-[56rem] text-left text-sm">
                    <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      <tr>
                        <th className="px-3 py-2.5">Anúncio</th>
                        <th className="px-3 py-2.5">Estoque hoje</th>
                        <th className="px-3 py-2.5">Vendas no período (+)</th>
                        <th className="px-3 py-2.5">NF não entregue</th>
                        <th className="px-3 py-2.5">Ajuste manual (+/−)</th>
                        <th className="px-3 py-2.5">Estoque na data</th>
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
                          const state = listingStateFor(
                            listingStatesByMlItemId,
                            listing.mlItemId,
                          );
                          const manual = manualFor(
                            manualByMlItemId,
                            listing.mlItemId,
                          );
                          const audit = listingAuditBreakdown(listing, state);
                          const currentUnits = inventoryBaseUnits(listing);
                          const included = audit.total > 0;
                          const usesCatalogSnapshot =
                            audit.mlStockSource === "catalog_snapshot";
                          const zeroBase =
                            currentUnits === 0 && !hasManualAdjustments(manual);

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
                                  {usesCatalogSnapshot ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      ML via snapshot
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px]"
                                    >
                                      Estimado por vendas
                                    </Badge>
                                  )}
                                  {included ? (
                                    <Badge
                                      variant="default"
                                      className="text-[10px]"
                                    >
                                      Incluído
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px]"
                                    >
                                      Fora do relatório
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {currentUnits}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {usesCatalogSnapshot ? (
                                  <span className="text-[var(--muted-foreground)]">
                                    —
                                  </span>
                                ) : (
                                  audit.salesAfterSnapshot
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <FormInput
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={manual.nfEmitidaNaoEntregue || ""}
                                  onChange={(e) =>
                                    updateManual(
                                      listing.mlItemId,
                                      "nfEmitidaNaoEntregue",
                                      e.target.value,
                                    )
                                  }
                                  inputClassName="h-8 w-20 tabular-nums"
                                  aria-label="NF emitida não entregue"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <FormInput
                                  type="number"
                                  step={1}
                                  value={
                                    manual.ajusteManual === 0
                                      ? ""
                                      : manual.ajusteManual
                                  }
                                  onChange={(e) =>
                                    updateManual(
                                      listing.mlItemId,
                                      "ajusteManual",
                                      e.target.value,
                                    )
                                  }
                                  inputClassName="h-8 w-24 tabular-nums"
                                  aria-label="Ajuste manual"
                                />
                              </td>
                              <td className="px-3 py-2 tabular-nums font-medium">
                                {audit.total}
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
                  Só entram produtos com estoque total maior que zero na data
                  escolhida.
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
                              ncm:
                                prev.ncm ||
                                anchorNcm(anchorSkuKey, productsBySku),
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
                    <th className="w-8 px-2 py-2.5" />
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
                        colSpan={8}
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
                      const isExpanded = expandedSkuRowKey === row.rowKey;
                      const memberSkuKeys =
                        row.skus.length > 0 ? row.skus : [row.rowKey];
                      const memberListings = memberSkuKeys.flatMap(
                        (skuKey) => listingsBySkuKey.get(skuKey) ?? [],
                      );

                      return (
                        <Fragment key={row.rowKey}>
                          <tr
                            className={cn(
                              "border-b border-[var(--border)] last:border-0",
                              row.missingCost && "bg-amber-50/40",
                              isExpanded && "bg-[var(--primary)]/5",
                            )}
                          >
                            <td className="px-2 py-2 text-[var(--muted-foreground)]">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSkuRowKey((prev) =>
                                    prev === row.rowKey ? null : row.rowKey,
                                  )
                                }
                                className="flex size-6 items-center justify-center rounded hover:bg-[var(--muted)]"
                                aria-expanded={isExpanded}
                                aria-label={
                                  isExpanded
                                    ? "Ocultar memória de cálculo"
                                    : "Ver memória de cálculo"
                                }
                              >
                                {isExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              {canSelect ? (
                                <input
                                  type="checkbox"
                                  checked={selectedSkuKeys.has(row.rowKey)}
                                  onChange={() =>
                                    toggleSkuSelection(row.rowKey)
                                  }
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
                          {isExpanded ? (
                            <tr className="border-b border-[var(--border)] bg-[var(--muted)]/20 last:border-0">
                              <td />
                              <td colSpan={7} className="px-3 py-3">
                                <SkuCalculationMemory
                                  row={row}
                                  memberListings={memberListings}
                                  listingStatesByMlItemId={
                                    listingStatesByMlItemId
                                  }
                                  salesPeriod={salesPeriod}
                                  snapshotDateInput={snapshotDateInput}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
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

function anchorNcm(
  anchorSkuKey: string,
  productsBySku: Record<string, StockReportProductInfo>,
): string {
  return productsBySku[anchorSkuKey]?.ncm ?? "";
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
          Monta o saldo em estoque por SKU na data escolhida e exporta em PDF ou
          Excel.
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
