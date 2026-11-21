"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SortableTh } from "@/components/ui/sortable-th";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ItemListSearch } from "@/components/shared/ItemListSearch";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatMoneyBRL, formatMoneyBRLOrDash } from "@/lib/format-money";
import type { StockPositionRow, StockReviewRow } from "@/lib/stock/stock-page-data";
import { StockItemSheet } from "@/components/stock/StockItemSheet";
import { StockReviewsPanel } from "@/components/stock/StockReviewsPanel";
import { formatUnits, listingTypeLabel } from "@/components/stock/stock-format";
import { cn } from "@/lib/utils";

type Filter = "all" | "with_stock" | "alerts" | "full" | "own_only";
type SortKey = "title" | "warehouse" | "deposit" | "full" | "total" | "value";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "with_stock", label: "Com estoque" },
  { id: "alerts", label: "Com alerta" },
  { id: "full", label: "No Full" },
  { id: "own_only", label: "Só em casa" },
];

const ALERT_TEXT = {
  deposit_exceeds_own: "O Mercado Livre está anunciando no depósito mais do que vocês têm em casa. Risco de vender sem ter.",
  negative_own: "Saiu mais do que entrou. Falta lançar uma entrada ou fazer um ajuste.",
  ml_unread: "Não foi possível ler este produto no Mercado Livre na última sincronização.",
} as const;

function sortValue(row: StockPositionRow, key: SortKey): string | number {
  switch (key) {
    case "title":
      return `${row.supplierName} ${row.title}`;
    case "warehouse":
      return row.warehouse ?? Number.NEGATIVE_INFINITY;
    case "deposit":
      return row.deposit ?? Number.NEGATIVE_INFINITY;
    case "full":
      return row.fullTotal ?? Number.NEGATIVE_INFINITY;
    case "total":
      return row.total ?? Number.NEGATIVE_INFINITY;
    case "value":
      return row.stockValue ?? Number.NEGATIVE_INFINITY;
  }
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "attention" }) {
  return (
    <Card
      className={cn(
        "rounded-2xl p-4",
        tone === "attention" && "border-amber-500/30 bg-amber-500/[0.06]",
      )}
    >
      <p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--foreground)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{hint}</p>
    </Card>
  );
}

function AlertIcons({ row }: { row: StockPositionRow }) {
  const shown = row.alerts.filter((a) => a !== "ml_unread");
  const unread = row.alerts.includes("ml_unread");
  if (shown.length === 0 && !unread) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          {shown.length > 0 ? (
            <AlertTriangle className="size-3.5 text-amber-600" aria-label="Alerta" />
          ) : (
            <Info className="size-3.5 text-[var(--muted-foreground)]" aria-label="Aviso" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {[...shown, ...(unread ? (["ml_unread"] as const) : [])].map((a) => (
          <p key={a}>{ALERT_TEXT[a]}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function ListingChips({ row }: { row: StockPositionRow }) {
  if (row.listings.length <= 1) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {row.listings.map((l) => (
        <Badge key={l.mlItemId} variant="muted" className="px-1.5 py-0 text-[10px] font-normal">
          {listingTypeLabel(l.listingTypeId)}
        </Badge>
      ))}
    </div>
  );
}

function CostCell({ row }: { row: StockPositionRow }) {
  return (
    <div className="text-right">
      <span className="tabular-nums">{formatMoneyBRLOrDash(row.unitCost)}</span>
      {row.nextUnitCost != null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mt-0.5 flex items-center justify-end gap-0.5 text-[11px] text-[var(--primary)]">
              <ArrowRight className="size-3" aria-hidden />
              {formatMoneyBRL(row.nextUnitCost)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            Custo novo programado. Entra em vigor depois que as {formatUnits(row.unitsBeforeNextCost)} un do lote atual
            forem vendidas.
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function StockPositionView({
  rows,
  reviews,
}: {
  rows: StockPositionRow[];
  reviews: StockReviewRow[];
}) {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("__all");
  // Abre em "Com estoque": é o que interessa no dia a dia.
  const [filter, setFilter] = useState<Filter>("with_stock");
  const [selected, setSelected] = useState<StockPositionRow | null>(null);

  const suppliers = useMemo(
    () => [...new Set(rows.map((r) => r.supplierName))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (supplier !== "__all" && r.supplierName !== supplier) return false;
      if (filter === "with_stock" && !((r.total ?? r.own) > 0)) return false;
      if (filter === "alerts" && !r.alerts.some((a) => a !== "ml_unread") && r.openReviews === 0) return false;
      if (filter === "full" && !((r.fullTotal ?? 0) > 0)) return false;
      if (filter === "own_only" && (r.fullTotal ?? 0) > 0) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q) ||
        r.listings.some((l) => l.mlItemId.toLowerCase().includes(q))
      );
    });
  }, [rows, query, supplier, filter]);

  const { sort, sortedRows, onSortChange } = useTableSort<StockPositionRow, SortKey>(filtered, sortValue, {
    key: "title",
    direction: "asc",
  });
  const groupBySupplier = sort.key === "title";

  const totals = useMemo(() => {
    let own = 0;
    let warehouse = 0;
    let deposit = 0;
    let full = 0;
    let fullUnavailable = 0;
    let value = 0;
    let withoutCost = 0;
    let alerts = 0;
    for (const r of rows) {
      own += r.own;
      warehouse += r.warehouse ?? 0;
      deposit += r.deposit ?? 0;
      full += r.fullTotal ?? 0;
      fullUnavailable += r.fullUnavailable ?? 0;
      if (r.stockValue != null) value += r.stockValue;
      else if ((r.total ?? 0) > 0) withoutCost += 1;
      if (r.alerts.some((a) => a !== "ml_unread")) alerts += 1;
    }
    return { own, warehouse, deposit, full, fullUnavailable, value, withoutCost, alerts };
  }, [rows]);

  const attention = reviews.length + totals.alerts;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Em casa"
            value={`${formatUnits(totals.own)} un`}
            hint={`Galpão ${formatUnits(totals.warehouse)} · Depósito ${formatUnits(totals.deposit)}`}
          />
          <Kpi
            label="No Full"
            value={`${formatUnits(totals.full)} un`}
            hint={
              totals.fullUnavailable > 0
                ? `${formatUnits(totals.fullUnavailable)} em transferência no ML`
                : "tudo disponível para venda"
            }
          />
          <Kpi
            label="Valor em estoque"
            value={formatMoneyBRL(totals.value)}
            hint={
              totals.withoutCost > 0
                ? `pelo custo do lote vigente · ${totals.withoutCost} sem custo`
                : "pelo custo do lote vigente"
            }
          />
          <Kpi
            label="Precisa de você"
            value={formatUnits(attention)}
            hint={attention > 0 ? "pendências e alertas abaixo" : "nada pendente"}
            tone={attention > 0 ? "attention" : undefined}
          />
        </div>

        <StockReviewsPanel
          reviews={reviews}
          items={rows.map((r) => ({ stockItemId: r.stockItemId, title: r.title, sku: r.sku }))}
        />

        {/* Filtros: uma linha no desktop largo (tudo com 40 px); abaixo disso,
            busca + fornecedor numa linha e as abas na de baixo (rolam se não couberem). */}
        <div className="space-y-2">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:flex-1">
              <ItemListSearch
                value={query}
                onChange={setQuery}
                placeholder="Buscar por nome, SKU ou MLB…"
                className="min-w-0 sm:flex-1 xl:max-w-md"
              />
              <FormSelect
                value={supplier}
                onValueChange={setSupplier}
                aria-label="Fornecedor"
                className="sm:w-60"
                triggerClassName="w-full"
                options={[{ value: "__all", label: "Todos os fornecedores" }, ...suppliers.map((s) => ({ value: s, label: s }))]}
              />
            </div>
            <div className="-mx-1 overflow-x-auto px-1">
              <SegmentedTabs
                tabs={FILTERS}
                value={filter}
                onValueChange={setFilter}
                baseId="stock-filter"
                ariaLabel="Filtrar produtos"
                className="h-10 shrink-0 [&_button]:py-0 [&_button]:whitespace-nowrap"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {filtered.length === rows.length
              ? `${formatUnits(rows.length)} produto${rows.length === 1 ? "" : "s"}`
              : `${formatUnits(filtered.length)} de ${formatUnits(rows.length)} produtos`}
          </p>
        </div>

        {/* Desktop: colunas de número com largura fixa; o nome do produto fica
            com o resto e corta com "…" (nome inteiro ao passar o mouse). */}
        <Card className="hidden overflow-hidden rounded-2xl lg:block">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-28" />
                <col className="w-24" />
                <col className="w-32" />
                <col className="w-36" />
              </colgroup>
              <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <tr className="[&>th]:pt-3">
                  <SortableTh label="Produto" sortKey="title" sort={sort} onSortChange={onSortChange} align="left" className="pl-4" />
                  <SortableTh
                    label="Galpão"
                    sortKey="warehouse"
                    sort={sort}
                    onSortChange={onSortChange}
                    hint={<HeaderHint text="Em casa menos o depósito: o que ainda não foi separado para venda. Sai da conta, ninguém lança." />}
                  />
                  <SortableTh
                    label="Depósito"
                    sortKey="deposit"
                    sort={sort}
                    onSortChange={onSortChange}
                    hint={<HeaderHint text="O &quot;estoque no depósito&quot; que o Mercado Livre mostra: o que está separado para vender fora do Full. O ML desconta a cada venda." />}
                  />
                  <SortableTh
                    label="Full"
                    sortKey="full"
                    sort={sort}
                    onSortChange={onSortChange}
                    hint={<HeaderHint text="Tudo que está com o Mercado Livre: disponível + em transferência entre os centros dele." />}
                  />
                  <SortableTh label="Total" sortKey="total" sort={sort} onSortChange={onSortChange} />
                  <th className="pb-2 pr-3 text-right font-medium">Custo</th>
                  <SortableTh label="Valor" sortKey="value" sort={sort} onSortChange={onSortChange} className="pr-4" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, index) => {
                  const showGroup = groupBySupplier && (index === 0 || sortedRows[index - 1].supplierName !== row.supplierName);
                  return (
                    <Fragment key={row.stockItemId}>
                      {showGroup ? (
                        <tr className="bg-[var(--muted)]/25">
                          <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                            {row.supplierName}
                          </td>
                        </tr>
                      ) : null}
                      <tr
                        className="cursor-pointer border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--accent)]/40"
                        onClick={() => setSelected(row)}
                      >
                        <td className="py-2.5 pl-4 pr-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {row.imageUrl ? (
                              <Image
                                src={row.imageUrl}
                                alt=""
                                width={36}
                                height={36}
                                className="size-9 shrink-0 rounded-md border border-[var(--border)] object-cover"
                              />
                            ) : (
                              <span className="size-9 shrink-0 rounded-md bg-[var(--muted)]" aria-hidden />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-medium text-[var(--foreground)]" title={row.title}>
                                  {row.title}
                                </span>
                                <AlertIcons row={row} />
                                {row.openReviews > 0 ? (
                                  <Badge variant="warning" className="shrink-0 px-1.5 py-0 text-[10px]">pendência</Badge>
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-[var(--muted-foreground)]" title={row.sku ?? undefined}>
                                {row.sku ?? "Sem SKU"}
                              </p>
                              <ListingChips row={row} />
                            </div>
                          </div>
                        </td>
                        <td className={cn("whitespace-nowrap py-2.5 pr-3 text-right tabular-nums", (row.warehouse ?? 0) < 0 && "font-medium text-amber-700 dark:text-amber-400")}>
                          {formatUnits(row.warehouse)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">{formatUnits(row.deposit)}</td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                          {formatUnits(row.fullTotal)}
                          {row.fullUnavailable ? (
                            <span className="block text-[11px] text-[var(--muted-foreground)]">
                              {formatUnits(row.fullUnavailable)} em transf.
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold tabular-nums">{formatUnits(row.total)}</td>
                        <td className="whitespace-nowrap py-2.5 pr-3">
                          <CostCell row={row} />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums">{formatMoneyBRLOrDash(row.stockValue)}</td>
                      </tr>
                    </Fragment>
                  );
                })}
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
                      Nenhum produto com esse filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Celular e tablet */}
        <div className="space-y-2 lg:hidden">
          {sortedRows.map((row) => (
            <Card
              key={row.stockItemId}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelected(row);
              }}
              className="rounded-2xl p-4"
            >
              <div className="flex gap-3">
                {row.imageUrl ? (
                  <Image
                    src={row.imageUrl}
                    alt=""
                    width={44}
                    height={44}
                    className="size-11 shrink-0 rounded-md border border-[var(--border)] object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span className="line-clamp-2 text-sm font-medium">{row.title}</span>
                    <AlertIcons row={row} />
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {row.sku ?? "Sem SKU"} · {row.supplierName}
                  </p>
                  <ListingChips row={row} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  ["Galpão", row.warehouse],
                  ["Depósito", row.deposit],
                  ["Full", row.fullTotal],
                  ["Total", row.total],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-md bg-[var(--muted)]/30 py-1.5">
                    <p className="text-[var(--muted-foreground)]">{label}</p>
                    <p className="text-sm font-semibold tabular-nums">{formatUnits(value as number | null)}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <StockItemSheet row={selected} onOpenChange={(open) => !open && setSelected(null)} />
      </div>
    </TooltipProvider>
  );
}

function HeaderHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help text-[var(--muted-foreground)]" aria-label="O que é">
          <Info className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs font-normal normal-case">{text}</TooltipContent>
    </Tooltip>
  );
}
