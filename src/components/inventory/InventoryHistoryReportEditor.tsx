"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileDown,
  FileSpreadsheet,
  FileText,
  Info,
  Package,
  PackagePlus,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SortableTh } from "@/components/ui/sortable-th";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/shared/ItemListSearch";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  aggregateStockReportBySku,
  buildStockReportRows,
  consolidateListingsBySku,
  formatStockReportCurrency,
  formatStockReportUnits,
  inventoryBaseUnits,
  listingAuditBreakdown,
  listingStateFor,
  listingTotalUnits,
  skuLabelFromKey,
  type StockReportHeader,
  type StockReportListingInput,
  type StockReportListingState,
  type StockReportMergeGroup,
  type StockReportProductGroup,
  type StockReportProductInfo,
  type StockReportRow,
} from "@/lib/inventory/inventory-stock-report";
import type { InventoryMonthSnapshotEvolution } from "@/lib/inventory/inventory-month-snapshot-report";
import { InventoryHistoryYearComparisonTable } from "@/components/inventory/InventoryHistoryYearComparisonTable";
import { cn } from "@/lib/utils";

type ManualListingAdjustments = {
  nfEmitidaNaoEntregue: number;
  ajusteManual: number;
};

type ManualListingAdjustmentDraft = {
  nfEmitidaNaoEntregue: string;
  ajusteManual: string;
};

const EMPTY_MANUAL: ManualListingAdjustments = {
  nfEmitidaNaoEntregue: 0,
  ajusteManual: 0,
};

const EMPTY_DRAFT: ManualListingAdjustmentDraft = {
  nfEmitidaNaoEntregue: "",
  ajusteManual: "",
};

type MergeDraft = {
  skuKeys: string[];
  anchorSkuKey: string;
  label: string;
  ncm: string;
  editingGroupId: string | null;
};

type ListingAdjustmentSortKey = "estoqueCongelado" | "estoqueNoRelatorio";

type SkuPreviewSortKey =
  | "produto"
  | "ncm"
  | "custoUnitario"
  | "unidades"
  | "valor";

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

function draftFor(
  map: Record<string, ManualListingAdjustmentDraft>,
  mlItemId: string,
): ManualListingAdjustmentDraft {
  return map[mlItemId] ?? EMPTY_DRAFT;
}

function parseDraftToManual(
  draft: ManualListingAdjustmentDraft,
): ManualListingAdjustments {
  return {
    nfEmitidaNaoEntregue: parseNonNegativeUnits(draft.nfEmitidaNaoEntregue),
    ajusteManual: parseSignedUnits(draft.ajusteManual),
  };
}

function manualToDraft(
  manual: ManualListingAdjustments,
): ManualListingAdjustmentDraft {
  return {
    nfEmitidaNaoEntregue:
      manual.nfEmitidaNaoEntregue === 0 ? "" : String(manual.nfEmitidaNaoEntregue),
    ajusteManual: manual.ajusteManual === 0 ? "" : String(manual.ajusteManual),
  };
}

function draftMapFromManual(
  map: Record<string, ManualListingAdjustments>,
): Record<string, ManualListingAdjustmentDraft> {
  return Object.fromEntries(
    Object.entries(map).map(([id, manual]) => [id, manualToDraft(manual)]),
  );
}

function manualMapFromDraft(
  map: Record<string, ManualListingAdjustmentDraft>,
): Record<string, ManualListingAdjustments> {
  const next: Record<string, ManualListingAdjustments> = {};
  for (const [id, draft] of Object.entries(map)) {
    const parsed = parseDraftToManual(draft);
    if (hasManualAdjustments(parsed)) next[id] = parsed;
  }
  return next;
}

function sameManual(
  a: ManualListingAdjustments,
  b: ManualListingAdjustments,
): boolean {
  return (
    a.nfEmitidaNaoEntregue === b.nfEmitidaNaoEntregue &&
    a.ajusteManual === b.ajusteManual
  );
}

/**
 * Converte os ajustes (que o usuário informa por PRODUTO) para o formato que
 * o relatório consome (por anúncio). O ajuste do produto entra inteiro no
 * anúncio âncora e os demais membros ficam zerados: `aggregateStockReportBySku`
 * soma os ajustes de todos os anúncios do grupo, então lançar tudo no âncora
 * dá o mesmo total sem contar a mesma correção duas vezes.
 */
function listingStatesFromManual(
  groups: StockReportProductGroup[],
  map: Record<string, ManualListingAdjustments>,
): Record<string, StockReportListingState> {
  const next: Record<string, StockReportListingState> = {};
  for (const group of groups) {
    const manual = manualFor(map, group.skuKey);
    for (const mlItemId of group.mlItemIds) {
      next[mlItemId] = {
        adjustment:
          mlItemId === group.mlItemId
            ? {
                nfEmitidaNaoEntregue: manual.nfEmitidaNaoEntregue,
                ajusteManual: manual.ajusteManual,
              }
            : EMPTY_MANUAL,
      };
    }
  }
  return next;
}

function anchorNcm(
  anchorSkuKey: string,
  productsBySku: Record<string, StockReportProductInfo>,
): string {
  return productsBySku[anchorSkuKey]?.ncm ?? "";
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
  memberGroups,
  groupStateBySkuKey,
  productsBySku,
}: {
  row: StockReportRow;
  /** Produtos que compõem a linha: 1 normalmente, N quando o usuário agrupou
   *  SKUs diferentes manualmente. Cada um já vem consolidado (galpão somado,
   *  Full contado uma vez), então a conta aqui fecha com a do relatório. */
  memberGroups: StockReportProductGroup[];
  groupStateBySkuKey: Record<string, StockReportListingState>;
  productsBySku: Record<string, StockReportProductInfo>;
}) {
  const perSkuValuation = (() => {
    if (row.skus.length <= 1) return null;
    const unitsBySku = new Map<string, number>();
    for (const group of memberGroups) {
      const state = listingStateFor(groupStateBySkuKey, group.skuKey);
      const units = listingTotalUnits(group, state);
      unitsBySku.set(group.skuKey, (unitsBySku.get(group.skuKey) ?? 0) + units);
    }
    return row.skus
      .filter((skuKey) => (unitsBySku.get(skuKey) ?? 0) > 0)
      .map((skuKey) => ({
        skuKey,
        units: unitsBySku.get(skuKey) ?? 0,
        unitCost: productsBySku[skuKey]?.unitCost ?? null,
      }));
  })();

  return (
    <div className="max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Memória de cálculo — {row.label}
      </p>

      {memberGroups.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Nenhum anúncio encontrado para este produto no fechamento deste mês.
        </p>
      ) : (
        memberGroups.map((group, index) => {
          const state = listingStateFor(groupStateBySkuKey, group.skuKey);
          const audit = listingAuditBreakdown(group, state);

          return (
            <div
              key={group.skuKey}
              className={cn(index > 0 && "mt-3 border-t border-[var(--border)] pt-3")}
            >
              {memberGroups.length > 1 ? (
                <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">
                  Produto: {group.sku ?? "Sem SKU"}{" "}
                  <span className="font-normal text-[var(--muted-foreground)]">
                    — {group.title}
                  </span>
                </p>
              ) : null}

              {group.mlItemIds.length > 1 ? (
                <p className="mb-1.5 text-[11px] text-[var(--muted-foreground)]">
                  {group.mlItemIds.length} anúncios no Mercado Livre para este
                  produto ({group.mlItemIds.join(", ")}) — galpão somado e
                  estoque Full contado uma vez só (mesmo estoque físico).
                </p>
              ) : null}

              <MemoriaLinha
                label="Estoque no galpão (fechamento)"
                value={String(audit.warehouseStock)}
                nota="congelado no fechamento do mês"
              />
              <MemoriaLinha
                label="Estoque no Mercado Livre (fechamento)"
                value={String(audit.mlStock)}
                nota="congelado no fechamento do mês"
              />
              <MemoriaLinha
                label="Estoque a caminho (Full)"
                value={String(audit.mlStockOnTheWay)}
                nota="congelado no fechamento do mês"
              />
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
                label="Estoque deste anúncio no fechamento"
                value={String(audit.total)}
                destaque
              />
            </div>
          );
        })
      )}

      <MemoriaDivider />

      {memberGroups.length > 1 ? (
        <MemoriaLinha
          label={`Soma de ${memberGroups.length} produtos`}
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
      {perSkuValuation ? (
        <>
          {perSkuValuation.map((entry) => (
            <MemoriaLinha
              key={entry.skuKey}
              label={`Unidades × Custo — ${skuLabelFromKey(entry.skuKey)}`}
              value={
                entry.unitCost != null
                  ? formatStockReportCurrency(entry.units * entry.unitCost)
                  : "—"
              }
              nota={
                entry.unitCost != null
                  ? `${formatStockReportUnits(entry.units)} × ${formatStockReportCurrency(entry.unitCost)}`
                  : "sem custo cadastrado"
              }
              fraca={entry.unitCost == null}
            />
          ))}
          <MemoriaDivider />
          <MemoriaLinha
            label="Soma do valor em estoque"
            value={
              row.stockValue != null
                ? formatStockReportCurrency(row.stockValue)
                : "—"
            }
            nota={row.missingCost ? "1 ou mais SKUs sem custo — não entra no valor total do relatório" : undefined}
            destaque
          />
        </>
      ) : row.unitCost != null ? (
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

export function InventoryHistoryReportEditor({
  listings,
  productsBySku,
  initialHeader,
  referenceDateIso,
  evolution,
}: {
  listings: StockReportListingInput[];
  productsBySku: Record<string, StockReportProductInfo>;
  initialHeader: StockReportHeader;
  referenceDateIso: string;
  evolution: InventoryMonthSnapshotEvolution;
}) {
  const referenceDate = useMemo(() => new Date(referenceDateIso), [referenceDateIso]);
  const [activeTab, setActiveTab] = useState<"report" | "compare">("report");
  const [header, setHeader] = useState(initialHeader);
  // Ajustes são por PRODUTO (skuKey), não por anúncio: 2 anúncios espelho
  // dividem o mesmo estoque físico, então "NF emitida não entregue" lançada
  // em cada um dobraria a correção.
  const [manualBySkuKey, setManualBySkuKey] = useState<
    Record<string, ManualListingAdjustments>
  >({});
  const [adjustmentDraft, setAdjustmentDraft] = useState<
    Record<string, ManualListingAdjustmentDraft>
  >({});
  const [mergeGroups, setMergeGroups] = useState<StockReportMergeGroup[]>([]);
  const [selectedSkuKeys, setSelectedSkuKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);
  const [listingSearch, setListingSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [expandedSkuRowKey, setExpandedSkuRowKey] = useState<string | null>(
    null,
  );

  // 1 entrada por produto (SKU), com galpão somado e Full contado uma vez só
  // quando os anúncios compartilham o mesmo pool — a mesma consolidação que o
  // relatório aplica, pra modal, memória de cálculo e relatório fecharem a
  // mesma conta.
  const productGroups = useMemo(
    () => consolidateListingsBySku(listings),
    [listings],
  );

  const productGroupsBySkuKey = useMemo(() => {
    const map = new Map<string, StockReportProductGroup>();
    for (const group of productGroups) map.set(group.skuKey, group);
    return map;
  }, [productGroups]);

  const listingStatesByMlItemId = useMemo(
    () => listingStatesFromManual(productGroups, manualBySkuKey),
    [productGroups, manualBySkuKey],
  );

  // Os mesmos ajustes, mas indexados por skuKey — é o que a modal e a memória
  // de cálculo consomem, já que lá a unidade é o produto.
  const groupStateBySkuKey = useMemo(() => {
    const map: Record<string, StockReportListingState> = {};
    for (const group of productGroups) {
      map[group.skuKey] = { adjustment: manualFor(manualBySkuKey, group.skuKey) };
    }
    return map;
  }, [productGroups, manualBySkuKey]);

  const draftGroupStateBySkuKey = useMemo(() => {
    const draftManual = manualMapFromDraft(adjustmentDraft);
    const map: Record<string, StockReportListingState> = {};
    for (const group of productGroups) {
      map[group.skuKey] = { adjustment: manualFor(draftManual, group.skuKey) };
    }
    return map;
  }, [productGroups, adjustmentDraft]);

  const filteredGroups = useMemo(
    () =>
      filterByItemListSearch(productGroups, listingSearch, (row) => ({
        sku: row.sku,
        title: row.title,
        // busca por qualquer um dos anúncios do produto
        extra: row.mlItemIds,
      })),
    [productGroups, listingSearch],
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

  const filteredReportRows = useMemo(
    () =>
      filterByItemListSearch(report.rows, skuSearch, (row) => ({
        sku: row.label,
        title: row.label,
        extra: [row.ncm, ...row.skus.map((skuKey) => skuLabelFromKey(skuKey))],
      })),
    [report.rows, skuSearch],
  );

  const totalUnits = useMemo(
    () => report.rows.reduce((sum, row) => sum + row.units, 0),
    [report.rows],
  );

  const adjustmentCount = useMemo(
    () =>
      Object.values(manualBySkuKey).filter((manual) =>
        hasManualAdjustments(manual),
      ).length,
    [manualBySkuKey],
  );

  const adjustmentDirtyCount = useMemo(() => {
    const ids = new Set([
      ...Object.keys(manualBySkuKey),
      ...Object.keys(adjustmentDraft),
    ]);
    let count = 0;
    for (const id of ids) {
      if (
        !sameManual(
          manualFor(manualBySkuKey, id),
          parseDraftToManual(draftFor(adjustmentDraft, id)),
        )
      ) {
        count += 1;
      }
    }
    return count;
  }, [adjustmentDraft, manualBySkuKey]);

  const {
    sort: extrasSort,
    sortedRows: sortedFilteredGroups,
    onSortChange: onExtrasSortChange,
  } = useTableSort<(typeof filteredGroups)[number], ListingAdjustmentSortKey>(
    filteredGroups,
    (group, key) => {
      const state = listingStateFor(draftGroupStateBySkuKey, group.skuKey);
      const audit = listingAuditBreakdown(group, state);
      switch (key) {
        case "estoqueCongelado":
          return inventoryBaseUnits(group);
        case "estoqueNoRelatorio":
          return audit.total;
      }
    },
    { key: "estoqueNoRelatorio", direction: "desc" },
  );

  const {
    sort: skuSort,
    sortedRows: sortedReportRows,
    onSortChange: onSkuSortChange,
  } = useTableSort<(typeof report.rows)[number], SkuPreviewSortKey>(
    filteredReportRows,
    (row, key) => {
      switch (key) {
        case "produto":
          return row.label;
        case "ncm":
          return row.ncm ?? "";
        case "custoUnitario":
          return row.unitCost ?? Number.NEGATIVE_INFINITY;
        case "unidades":
          return row.units;
        case "valor":
          return row.stockValue ?? Number.NEGATIVE_INFINITY;
      }
    },
    { key: "valor", direction: "desc" },
  );

  function handleAdjustmentsOpenChange(open: boolean) {
    if (open) {
      setAdjustmentDraft(draftMapFromManual(manualBySkuKey));
      setShowExtras(true);
      return;
    }
    setShowExtras(false);
    setAdjustmentDraft({});
  }

  function updateAdjustmentDraft(
    mlItemId: string,
    field: keyof ManualListingAdjustmentDraft,
    value: string,
  ) {
    setAdjustmentDraft((prev) => ({
      ...prev,
      [mlItemId]: {
        ...draftFor(prev, mlItemId),
        [field]: value,
      },
    }));
  }

  function applyAdjustmentDraft() {
    setManualBySkuKey(manualMapFromDraft(adjustmentDraft));
    setShowExtras(false);
    setAdjustmentDraft({});
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

  const mergeAnchorOptions = mergeDraft
    ? mergeDraft.skuKeys.map((key) => {
        const row = skuPreview.find((r) => r.rowKey === key);
        return { value: key, label: row?.label ?? key };
      })
    : [];

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <CircleDollarSign className="size-3.5" aria-hidden />
            Valor em estoque
          </div>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
            {formatStockReportCurrency(report.totalValue)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Boxes className="size-3.5" aria-hidden />
            Unidades
          </div>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
            {formatStockReportUnits(totalUnits)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Package className="size-3.5" aria-hidden />
            SKUs no relatório
          </div>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
            {report.rows.length}
          </p>
        </div>
        <div
          className={cn(
            "rounded-2xl border bg-[var(--card)] px-4 py-3",
            report.missingCostCount > 0
              ? "border-amber-200/80"
              : "border-[var(--border)]",
          )}
        >
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <AlertTriangle className="size-3.5" aria-hidden />
            Sem custo
          </div>
          <p
            className={cn(
              "mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:text-xl",
              report.missingCostCount > 0 && "text-amber-800",
            )}
          >
            {report.missingCostCount}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
            {report.missingCostCount > 0
              ? "não entram no valor total"
              : "todos com custo cadastrado"}
          </p>
        </div>
      </div>

      <div className="inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("report")}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
            activeTab === "report"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]",
          )}
        >
          <FileText className="size-4" aria-hidden />
          Relatório do mês
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("compare")}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
            activeTab === "compare"
              ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]",
          )}
        >
          <TrendingUp className="size-4" aria-hidden />
          Comparar mês a mês
        </button>
      </div>

      {activeTab === "compare" ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Comparar mês a mês
            </h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Unidades e valor em estoque de cada produto, mês a mês, num ano
              escolhido.
            </p>
          </div>
          <InventoryHistoryYearComparisonTable evolution={evolution} />
        </Card>
      ) : (
      <>
      <Sheet open={showExtras} onOpenChange={handleAdjustmentsOpenChange}>
        <SheetContent className="sm:max-w-4xl">
          <SheetHeader className="pr-10">
            <SheetTitle>Ajustes por anúncio</SheetTitle>
            <SheetDescription>
              Rascunho local — o relatório e a exportação só mudam depois de
              aplicar. Nada é gravado no fechamento congelado.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3.5 py-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Use para NF emitida ainda não entregue ou um ajuste pontual
              (+/−). Fechar sem aplicar descarta o que você digitou aqui.
            </div>
            <ItemListSearch
              value={listingSearch}
              onChange={setListingSearch}
              filteredCount={filteredGroups.length}
              totalCount={productGroups.length}
            />
            {filteredGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
                {itemListSearchEmptyMessage(listingSearch)}
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <div className="hidden items-center gap-3 border-b border-[var(--border)] bg-[var(--muted)]/70 px-4 py-2 text-[11px] font-semibold tracking-wide text-[var(--muted-foreground)] uppercase md:grid md:grid-cols-[minmax(0,1.6fr)_5.5rem_7rem_7.5rem_6.5rem]">
                  <span>Produto</span>
                  <button
                    type="button"
                    className={cn(
                      "cursor-pointer text-right hover:text-[var(--foreground)]",
                      extrasSort.key === "estoqueCongelado" &&
                        "text-[var(--foreground)]",
                    )}
                    onClick={() => onExtrasSortChange("estoqueCongelado")}
                  >
                    Congelado
                  </button>
                  <span className="text-right">NF não entregue</span>
                  <span className="text-right">Ajuste +/−</span>
                  <button
                    type="button"
                    className={cn(
                      "cursor-pointer text-right hover:text-[var(--foreground)]",
                      extrasSort.key === "estoqueNoRelatorio" &&
                        "text-[var(--foreground)]",
                    )}
                    onClick={() => onExtrasSortChange("estoqueNoRelatorio")}
                  >
                    Prévia
                  </button>
                </div>
                <ul className="max-h-[min(28rem,50vh)] divide-y divide-[var(--border)] overflow-y-auto">
                  {sortedFilteredGroups.map((group) => {
                    const draftFields = draftFor(adjustmentDraft, group.skuKey);
                    const appliedManual = manualFor(manualBySkuKey, group.skuKey);
                    const draftManual = parseDraftToManual(draftFields);
                    const draftState = listingStateFor(
                      draftGroupStateBySkuKey,
                      group.skuKey,
                    );
                    const draftAudit = listingAuditBreakdown(group, draftState);
                    const currentUnits = inventoryBaseUnits(group);
                    const included = draftAudit.total > 0;
                    const rowDirty = !sameManual(draftManual, appliedManual);
                    const delta = draftAudit.total - currentUnits;

                    return (
                      <li
                        key={group.skuKey}
                        className={cn(
                          "grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_5.5rem_7rem_7.5rem_6.5rem] md:items-center",
                          rowDirty && "bg-[var(--primary)]/5",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-[var(--foreground)]">
                              {group.sku ?? "Sem SKU"}
                            </p>
                            {group.mlItemIds.length > 1 ? (
                              <Badge variant="muted" className="text-[10px]">
                                {group.mlItemIds.length} anúncios
                              </Badge>
                            ) : null}
                            {rowDirty ? (
                              <Badge variant="outline" className="text-[10px]">
                                Alterado
                              </Badge>
                            ) : included ? (
                              <Badge variant="muted" className="text-[10px]">
                                Incluído
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Fora
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted-foreground)]">
                            {group.title}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-sm md:block md:text-right">
                          <span className="text-xs text-[var(--muted-foreground)] md:hidden">
                            Congelado
                          </span>
                          <span className="tabular-nums text-[var(--foreground)]">
                            {currentUnits}
                          </span>
                        </div>
                        <FormInput
                          id={`ajuste-nf-${group.skuKey}`}
                          type="number"
                          min={0}
                          step={1}
                          label="NF não entregue"
                          value={draftFields.nfEmitidaNaoEntregue}
                          onChange={(e) =>
                            updateAdjustmentDraft(
                              group.skuKey,
                              "nfEmitidaNaoEntregue",
                              e.target.value,
                            )
                          }
                          className="md:[&_label]:sr-only"
                          inputClassName="h-9 tabular-nums md:text-right"
                        />
                        <FormInput
                          id={`ajuste-manual-${group.skuKey}`}
                          type="number"
                          step={1}
                          label="Ajuste +/−"
                          value={draftFields.ajusteManual}
                          onChange={(e) =>
                            updateAdjustmentDraft(
                              group.skuKey,
                              "ajusteManual",
                              e.target.value,
                            )
                          }
                          className="md:[&_label]:sr-only"
                          inputClassName="h-9 tabular-nums md:text-right"
                        />
                        <div className="flex items-center justify-between md:block md:text-right">
                          <span className="text-xs text-[var(--muted-foreground)] md:hidden">
                            Prévia
                          </span>
                          <div>
                            <p className="font-semibold tabular-nums text-[var(--foreground)]">
                              {draftAudit.total}
                            </p>
                            {delta !== 0 ? (
                              <p
                                className={cn(
                                  "text-[11px] tabular-nums",
                                  delta > 0
                                    ? "text-emerald-700"
                                    : "text-rose-700",
                                )}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </SheetBody>
          <SheetFooter className="flex-col sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--muted-foreground)]">
              {adjustmentDirtyCount > 0
                ? `${adjustmentDirtyCount} anúncio${adjustmentDirtyCount !== 1 ? "s" : ""} com mudança pendente`
                : "Nenhuma mudança neste rascunho"}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAdjustmentsOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={adjustmentDirtyCount === 0}
                onClick={applyAdjustmentDraft}
              >
                <Check className="size-4" aria-hidden />
                Aplicar mudanças
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Card className="overflow-hidden rounded-2xl p-0">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Relatório por SKU
              </h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex size-4 cursor-pointer items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    aria-label="Como o custo unitário é calculado"
                  >
                    <Info className="size-3.5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  O custo é o mesmo <strong>Custo de precificação</strong>{" "}
                  mostrado em Meus produtos, congelado no momento do
                  fechamento deste mês. Produtos sem esse custo cadastrado na
                  época aparecem como valor faltante.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAdjustmentsOpenChange(true)}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Ajustes
                {adjustmentCount > 0 ? (
                  <Badge variant="default" className="ml-0.5 h-5 min-w-5 px-1.5 text-[10px]">
                    {adjustmentCount}
                  </Badge>
                ) : null}
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    <Settings2 className="size-3.5" aria-hidden />
                    Cabeçalho
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 space-y-3" align="end">
                  <FormInput
                    label="Empresa"
                    value={header.companyName}
                    onChange={(e) =>
                      setHeader((prev) => ({ ...prev, companyName: e.target.value }))
                    }
                  />
                  <FormInput
                    label="Título do relatório"
                    value={header.subtitle}
                    onChange={(e) =>
                      setHeader((prev) => ({ ...prev, subtitle: e.target.value }))
                    }
                  />
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={report.rows.length === 0}
                onClick={() => {
                  void import("@/lib/inventory/inventory-stock-report-excel").then(
                    ({ downloadStockReportExcel }) =>
                      downloadStockReportExcel(header, report, referenceDate),
                  );
                }}
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={report.rows.length === 0}
                onClick={() => {
                  void import("@/lib/inventory/inventory-stock-report-pdf").then(
                    ({ downloadStockReportPdf }) =>
                      downloadStockReportPdf(header, report, referenceDate),
                  );
                }}
              >
                <FileDown className="size-4" />
                PDF
              </Button>
            </div>
          </div>
          <ItemListSearch
            value={skuSearch}
            onChange={setSkuSearch}
            filteredCount={filteredReportRows.length}
            totalCount={report.rows.length}
            placeholder="Buscar produto, SKU ou NCM…"
            entitySingular="produto"
            entityPlural="produtos"
          />
        </div>

        {selectedSkuKeys.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-2.5 sm:px-5">
            <p className="text-sm text-[var(--foreground)]">
              <span className="font-semibold tabular-nums">
                {selectedSkuKeys.size}
              </span>{" "}
              SKU{selectedSkuKeys.size !== 1 ? "s" : ""} selecionado
              {selectedSkuKeys.size !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSkuKeys(new Set())}
              >
                Limpar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectedSkuKeys.size < 2}
                onClick={() => openMergeDraft()}
              >
                <PackagePlus className="size-4" />
                Agrupar
              </Button>
            </div>
          </div>
        ) : null}

        {mergeDraft ? (
          <Card className="mx-4 mt-4 space-y-3 border-[var(--primary)]/40 bg-[var(--primary)]/5 p-4 sm:mx-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {mergeDraft.editingGroupId ? "Editar grupo" : "Novo grupo de SKUs"}
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
                  mergeAnchorOptions.find((o) => o.value === mergeDraft.anchorSkuKey)
                    ?.label
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--muted)]/95 text-xs uppercase tracking-wide text-[var(--muted-foreground)] backdrop-blur-sm">
              <tr>
                <th className="w-8 px-2 py-2.5" />
                <th className="w-10 px-3 py-2.5" />
                <SortableTh
                  label="Produto (SKU)"
                  sortKey="produto"
                  sort={skuSort}
                  onSortChange={onSkuSortChange}
                  align="left"
                  className="px-3 py-2.5"
                />
                <SortableTh
                  label="NCM"
                  sortKey="ncm"
                  sort={skuSort}
                  onSortChange={onSkuSortChange}
                  align="left"
                  className="px-3 py-2.5"
                />
                <SortableTh
                  label="Custo unit."
                  sortKey="custoUnitario"
                  sort={skuSort}
                  onSortChange={onSkuSortChange}
                  align="left"
                  className="px-3 py-2.5"
                />
                <SortableTh
                  label="Unidades"
                  sortKey="unidades"
                  sort={skuSort}
                  onSortChange={onSkuSortChange}
                  align="left"
                  className="px-3 py-2.5"
                />
                <SortableTh
                  label="Valor"
                  sortKey="valor"
                  sort={skuSort}
                  onSortChange={onSkuSortChange}
                  align="left"
                  className="px-3 py-2.5"
                />
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
                    {skuSearch.trim()
                      ? itemListSearchEmptyMessage(skuSearch, "produto")
                      : "Nenhum produto com estoque neste fechamento. Use Ajustes para incluir anúncios zerados."}
                  </td>
                </tr>
              ) : (
                sortedReportRows.map((row) => {
                  const mergeGroup = mergeGroups.find(
                    (group) => group.id === row.rowKey,
                  );
                  const isMerged = mergeGroup != null;
                  const canSelect =
                    !isMerged &&
                    skuPreview.some((skuRow) => skuRow.rowKey === row.rowKey);
                  const isExpanded = expandedSkuRowKey === row.rowKey;
                  const memberSkuKeys =
                    row.skus.length > 0 ? row.skus : [row.rowKey];
                  const memberGroups = memberSkuKeys.flatMap((skuKey) => {
                    const group = productGroupsBySkuKey.get(skuKey);
                    return group ? [group] : [];
                  });

                  return (
                    <Fragment key={row.rowKey}>
                      <tr
                        className={cn(
                          "border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40",
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
                            className="flex size-6 cursor-pointer items-center justify-center rounded hover:bg-[var(--muted)]"
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
                              className="cursor-pointer"
                              checked={selectedSkuKeys.has(row.rowKey)}
                              onChange={() => toggleSkuSelection(row.rowKey)}
                              aria-label={`Selecionar ${row.label}`}
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          <button
                            type="button"
                            className="cursor-pointer text-left hover:underline"
                            onClick={() =>
                              setExpandedSkuRowKey((prev) =>
                                prev === row.rowKey ? null : row.rowKey,
                              )
                            }
                          >
                            {row.label}
                          </button>
                          {isMerged ? (
                            <p className="mt-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">
                              {row.skus.length} SKUs agrupados
                            </p>
                          ) : null}
                        </td>
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
                              memberGroups={memberGroups}
                              groupStateBySkuKey={groupStateBySkuKey}
                              productsBySku={productsBySku}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {sortedReportRows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-[var(--border)] bg-[var(--muted)]/60 font-semibold">
                  <td colSpan={6} className="px-3 py-3 text-right">
                    Valor total em estoque
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
      </Card>
      </>
      )}
    </div>
    </TooltipProvider>
  );
}
