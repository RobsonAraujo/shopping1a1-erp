"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, ImageOff, Settings } from "lucide-react";
import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { formatSellerListingStartedLabel } from "@/lib/mercadolibre/listing-dates";
import {
  formatRevenueBRL,
  getCalendarMonthLabels,
  getCalendarMonthRanges,
  REVENUE_TOOLTIP_HINT,
} from "@/lib/mercadolibre/revenue-periods";
import type {
  PurchasePerformanceTier,
  PurchaseRecommendation,
  PurchaseStatus,
} from "@/lib/purchase-analysis";
import { MetricWithHint } from "@/components/metric-with-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const performanceLabels: Record<PurchasePerformanceTier, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  zero: "Zero",
};

const performanceVariants: Record<
  PurchasePerformanceTier,
  "success" | "secondary" | "warning" | "muted"
> = {
  alta: "success",
  media: "secondary",
  baixa: "warning",
  zero: "muted",
};

const statusLabels: Record<PurchaseStatus, string> = {
  urgente: "Urgente",
  planejar: "Planejar",
  ok: "OK",
  sem_vendas: "Sem vendas",
  evitar: "Evitar",
};

const statusVariants: Record<
  PurchaseStatus,
  "overdue" | "warning" | "success" | "muted" | "secondary"
> = {
  urgente: "overdue",
  planejar: "warning",
  ok: "success",
  sem_vendas: "muted",
  evitar: "secondary",
};

const recommendationLabels: Record<PurchaseRecommendation, string> = {
  comprar: "Comprar",
  revisar: "Revisar",
  nao_repor: "Não repor",
};

function formatCoverage(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "< 1 dia";
  const floored = Math.floor(days);
  return `${floored} ${floored === 1 ? "dia" : "dias"}`;
}

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function BadgeTooltip({
  content,
  children,
}: {
  content: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function CopyableTooltipRow({
  label,
  value,
  displayValue,
}: {
  label: string;
  value: string | null;
  displayValue?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
        // ignore clipboard errors
      }
    },
    [value],
  );

  if (!value) {
    return (
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </p>
        <p className="mt-0.5 font-semibold text-[var(--popover-foreground)]">
          {displayValue ?? "—"}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-[var(--accent)]/60"
      title={`Copiar ${label.toLowerCase()}`}
    >
      <span className="min-w-0 flex-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className="mt-0.5 block font-semibold leading-snug text-[var(--popover-foreground)]">
          {displayValue ?? value}
        </span>
      </span>
      <span className="mt-0.5 shrink-0 text-[var(--muted-foreground)]">
        {copied ? (
          <Check className="size-3.5 text-emerald-600" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </span>
      <span className="sr-only">
        {copied ? `${label} copiado` : `Copiar ${label.toLowerCase()}`}
      </span>
    </button>
  );
}

function ItemRevenueBadge({
  lastMonth,
  currentMonth,
}: {
  lastMonth: number;
  currentMonth: number;
}) {
  const monthLabels = useMemo(
    () => getCalendarMonthLabels(getCalendarMonthRanges()),
    [],
  );

  if (lastMonth <= 0 && currentMonth <= 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-0.5 inline-flex h-4 max-w-full min-w-0 cursor-pointer items-center truncate rounded-md border border-emerald-300/90 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-900 underline decoration-emerald-400/50 decoration-dotted underline-offset-2 transition-all hover:border-emerald-400 hover:bg-emerald-100 hover:decoration-emerald-600/70 hover:shadow-sm active:bg-emerald-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 data-[state=open]:border-emerald-400 data-[state=open]:bg-emerald-100"
          aria-label={`Faturamento mês anterior: ${formatRevenueBRL(lastMonth)}. Toque para ver detalhes.`}
        >
          <span className="truncate tabular-nums">
            {formatRevenueBRL(lastMonth)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-52 space-y-2 p-2.5">
        <p className="text-[11px] font-medium text-[var(--foreground)]">
          Faturamento
        </p>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="text-[var(--muted-foreground)]">
              {monthLabels.lastMonth}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-emerald-900">
              {formatRevenueBRL(lastMonth)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="text-[var(--muted-foreground)]">
              {monthLabels.currentMonth}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-emerald-900">
              {formatRevenueBRL(currentMonth)}
            </span>
          </div>
        </div>
        <p className="text-[10px] leading-snug text-[var(--muted-foreground)]">
          {REVENUE_TOOLTIP_HINT}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function catalogStatusLabel(status: string | null): string | null {
  if (!status) return null;
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  if (status === "shared") return "Compartilhado";
  return "Desconhecido";
}

type SupplierPurchaseAnalysisTableProps = {
  rows: PurchaseAnalysisItemRow[];
  showCostColumns?: boolean;
};

export function SupplierPurchaseAnalysisTable({
  rows,
  showCostColumns = true,
}: SupplierPurchaseAnalysisTableProps) {
  const router = useRouter();
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const settingsRow = settingsId
    ? (rows.find((r) => r.item.id === settingsId) ?? null)
    : null;

  return (
    <TooltipProvider delayDuration={200} disableHoverableContent={false}>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
              <tr>
                <th className="w-[10.5rem] max-w-[10.5rem] px-2.5 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Produto
                </th>
                <th className="w-[8rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Estoque
                </th>
                <th className="w-[5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Vendas
                </th>
                <th className="w-[5.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Cobertura
                </th>
                <th className="w-[4.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Rotação
                </th>
                <th className="w-[5.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Status
                </th>
                <th className="w-[4.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Qtd.
                </th>
                <th className="w-[6rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Ação
                </th>
                {showCostColumns ? (
                  <th className="w-[11rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Custos
                  </th>
                ) : null}
                <th className="w-[6.5rem] px-2 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={showCostColumns ? 10 : 9}
                    className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                  >
                    Nenhum produto neste fornecedor.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { analysis } = row;
                  const catalogLabel = catalogStatusLabel(row.catalogStatus);
                  const imageUrl = bestItemImageUrl(row.item);
                  const listingStarted = formatSellerListingStartedLabel(
                    row.item,
                  );
                  return (
                    <tr
                      key={row.item.id}
                      className={cn(
                        "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40",
                        analysis.purchaseStatus === "urgente" &&
                          "bg-rose-50/30",
                      )}
                    >
                      <td className="max-w-[10.5rem] align-middle px-2.5 py-3">
                        {listingStarted ? (
                          <p
                            className="mb-1 text-[10px] leading-none text-[var(--muted-foreground)]"
                            title={listingStarted.hint}
                          >
                            {listingStarted.label}
                          </p>
                        ) : null}
                        <div className="flex min-w-0 gap-2">
                          <Link
                            href={`/dashboard/items/${row.item.id}`}
                            className="relative shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]"
                          >
                            {imageUrl ? (
                              <Image
                                src={imageUrl}
                                alt=""
                                width={40}
                                height={40}
                                className="size-10 object-contain"
                                sizes="40px"
                              />
                            ) : (
                              <span className="flex size-10 items-center justify-center">
                                <ImageOff
                                  className="size-4 text-[var(--muted-foreground)]/60"
                                  aria-hidden
                                />
                              </span>
                            )}
                          </Link>
                          <span className="min-w-0 flex-1 overflow-hidden">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block min-w-0 cursor-default overflow-hidden">
                                  <span className="block truncate text-xs font-semibold leading-snug text-[var(--foreground)]">
                                    {row.sku ?? "Sem SKU"}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[11px] leading-snug text-[var(--muted-foreground)]">
                                    {row.item.title}
                                  </span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="pointer-events-auto max-w-xs space-y-2 p-2.5 text-left"
                              >
                                <CopyableTooltipRow
                                  label="SKU"
                                  value={row.sku}
                                  displayValue={row.sku ?? "Sem SKU"}
                                />
                                <CopyableTooltipRow
                                  label="Nome"
                                  value={row.item.title}
                                />
                                {row.categoryPath ? (
                                  <p className="px-1 text-[var(--muted-foreground)]">
                                    Categoria: {row.categoryPath}
                                  </p>
                                ) : null}
                                {listingStarted ? (
                                  <p
                                    className="px-1 text-[var(--muted-foreground)]"
                                    title={listingStarted.hint}
                                  >
                                    {listingStarted.label}
                                  </p>
                                ) : null}
                              </TooltipContent>
                            </Tooltip>
                            {row.categoryName ? (
                              <Badge
                                className="mt-0.5 h-4 max-w-full truncate border-sky-200/80 bg-sky-50 px-1.5 text-[10px] font-normal text-sky-900"
                                title={row.categoryPath ?? undefined}
                              >
                                {row.categoryName}
                              </Badge>
                            ) : null}
                            <ItemRevenueBadge
                              lastMonth={row.revenueLastMonth}
                              currentMonth={row.revenueCurrentMonth}
                            />
                            {catalogLabel ? (
                              <Badge
                                variant="outline"
                                className="mt-1 h-4 max-w-full truncate px-1 text-[9px]"
                                title={catalogLabel}
                              >
                                {catalogLabel}
                              </Badge>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="align-middle px-2 py-3 text-xs whitespace-nowrap tabular-nums">
                        <div>
                          <span className="text-[var(--muted-foreground)]">
                            Galpão:{" "}
                          </span>
                          {row.warehouseStock}
                        </div>
                        <div>
                          <span className="text-[var(--muted-foreground)]">
                            ML (estoque):{" "}
                          </span>
                          {row.mlStock}
                        </div>
                        <div className="font-medium text-[var(--foreground)]">
                          <span className="font-normal text-[var(--muted-foreground)]">
                            Total:{" "}
                          </span>
                          {row.totalStock}
                        </div>
                      </td>
                      <td className="align-middle px-2 py-3 tabular-nums">
                        <div>{row.unitsSold}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {analysis.dailyAvg.toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}
                          /dia
                        </div>
                      </td>
                      <td className="align-middle px-2 py-3 tabular-nums text-[var(--muted-foreground)]">
                        {formatCoverage(analysis.coverageDays)}
                      </td>
                      <td className="align-middle px-2 py-3">
                        <BadgeTooltip content={analysis.performanceTooltip}>
                          <Badge
                            variant={
                              performanceVariants[analysis.performanceTier]
                            }
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {performanceLabels[analysis.performanceTier]}
                          </Badge>
                        </BadgeTooltip>
                      </td>
                      <td className="align-middle px-2 py-3">
                        <BadgeTooltip content={analysis.statusTooltip}>
                          <Badge
                            variant={statusVariants[analysis.purchaseStatus]}
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {statusLabels[analysis.purchaseStatus]}
                          </Badge>
                        </BadgeTooltip>
                      </td>
                      <td className="align-middle px-2 py-3 tabular-nums font-medium">
                        <MetricWithHint
                          content={analysis.recommendationTooltip}
                        >
                          <span>{analysis.suggestedQty}</span>
                        </MetricWithHint>
                      </td>
                      <td className="align-middle px-2 py-3">
                        <Badge
                          variant={
                            analysis.recommendation === "comprar"
                              ? "success"
                              : analysis.recommendation === "nao_repor"
                                ? "muted"
                                : "warning"
                          }
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {recommendationLabels[analysis.recommendation]}
                        </Badge>
                      </td>
                      {showCostColumns ? (
                        <td className="align-middle px-2 py-3 text-xs whitespace-nowrap">
                          <div>
                            <span className="text-[var(--muted-foreground)]">
                              Custo pago:{" "}
                            </span>
                            {formatMoney(row.lastPurchasePrice)}
                          </div>
                          <div>
                            <span className="text-[var(--muted-foreground)]">
                              Custo aceitável:{" "}
                            </span>
                            {formatMoney(row.minAcceptablePrice)}
                          </div>
                        </td>
                      ) : null}
                      <td className="align-middle px-2 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            title="Configurações de compra"
                            aria-label="Configurações de compra"
                            onClick={() => setSettingsId(row.item.id)}
                          >
                            <Settings className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            asChild
                          >
                            <a
                              href={row.item.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="size-3.5" aria-hidden />
                              ML
                            </a>
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

      {settingsRow ? (
        <PurchaseCostSettingsModal
          row={settingsRow}
          onClose={() => setSettingsId(null)}
          onSaved={() => {
            setSettingsId(null);
            router.refresh();
          }}
        />
      ) : null}
    </TooltipProvider>
  );
}

function PurchaseCostSettingsModal({
  row,
  onClose,
  onSaved,
}: {
  row: PurchaseAnalysisItemRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labelId = useId();
  const [lastPurchasePrice, setLastPurchasePrice] = useState(
    row.lastPurchasePrice != null ? String(row.lastPurchasePrice) : "",
  );
  const [minAcceptablePrice, setMinAcceptablePrice] = useState(
    row.minAcceptablePrice != null ? String(row.minAcceptablePrice) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLastPurchasePrice(
      row.lastPurchasePrice != null ? String(row.lastPurchasePrice) : "",
    );
    setMinAcceptablePrice(
      row.minAcceptablePrice != null ? String(row.minAcceptablePrice) : "",
    );
  }, [row.item.id, row.lastPurchasePrice, row.minAcceptablePrice]);

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

  function parseOptionalMoney(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return NaN;
    return n;
  }

  async function submit() {
    const last = parseOptionalMoney(lastPurchasePrice);
    const min = parseOptionalMoney(minAcceptablePrice);
    if (Number.isNaN(last) || Number.isNaN(min)) {
      setError("Informe valores numéricos válidos (≥ 0) ou deixe em branco.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(row.item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: row.warehouseStock,
            lastPurchasePrice: last,
            minAcceptablePrice: min,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={labelId}
          className="text-lg font-semibold text-[var(--primary)]"
        >
          Configurações de compra
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {row.sku ?? "Sem SKU"}
        </p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="last-purchase-price"
              className="block text-sm font-medium"
            >
              Custo pago na última compra (R$)
            </label>
            <input
              id="last-purchase-price"
              type="text"
              inputMode="decimal"
              value={lastPurchasePrice}
              onChange={(e) => setLastPurchasePrice(e.target.value)}
              placeholder="Ex.: 45.90"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              O que você pagou ao fornecedor por unidade na última compra.
            </p>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="min-acceptable-price"
              className="block text-sm font-medium"
            >
              Custo aceitável (R$)
            </label>
            <input
              id="min-acceptable-price"
              type="text"
              inputMode="decimal"
              value={minAcceptablePrice}
              onChange={(e) => setMinAcceptablePrice(e.target.value)}
              placeholder="Ex.: 50.00"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Teto por unidade que ainda compensa comprar deste fornecedor.
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
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
        </div>
      </div>
    </div>
  );
}
