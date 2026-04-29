"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ImageOff, LayoutGrid } from "lucide-react";
import { stockPlanningConfig } from "@/config/stock-planning";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { DashboardAttentionPurchasePanel } from "@/components/dashboard-attention-purchase-panel";
import { MetricWithHint } from "@/components/metric-with-hint";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type StockAttentionKind = "full" | "purchase";

export type StockAttentionAcknowledgementView = {
  mlItemId: string;
  kind: StockAttentionKind;
  mlAvailableQuantity: number;
  warehouseQuantity: number;
  purchaseLeadTimeDays: number | null;
};

type AttentionRow = {
  item: ItemBody;
  plan: ReturnType<typeof computeStockPlanningDisplay>;
};

type AttentionSectionProps = {
  title: string;
  description: string;
  countVariant: "warning" | "secondary";
  rows: AttentionRow[];
  mode: "full" | "purchase";
  onAcknowledge: (itemId: string, kind: StockAttentionKind) => Promise<boolean>;
};

function AttentionSection({
  title,
  description,
  countVariant,
  rows,
  mode,
  onAcknowledge,
}: AttentionSectionProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buttonLabel = mode === "full" ? "Já enviei/agendei" : "Já comprei";

  async function acknowledge(itemId: string) {
    setError(null);
    setSavingId(itemId);
    try {
      const ok = await onAcknowledge(itemId, mode);
      if (!ok) {
        setError("Não foi possível marcar ação tomada.");
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="overflow-hidden border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-[var(--card)] shadow-md ring-1 ring-amber-100/70">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <CardTitle className="text-lg text-[var(--primary)]">
              {title}
            </CardTitle>
          </div>
          <CardDescription className="max-w-2xl text-sm leading-relaxed">
            {description}
          </CardDescription>
        </div>
        {rows.length > 0 ? (
          <Badge variant={countVariant} className="shrink-0 px-3 py-1 text-sm">
            {rows.length} {rows.length === 1 ? "anúncio" : "anúncios"}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="pb-4">
        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-6 py-12 text-center">
            <LayoutGrid
              className="mb-3 size-10 text-[var(--muted-foreground)] opacity-60"
              aria-hidden
            />
            <p className="max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              Nenhum anúncio nesta situação no momento.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map(({ item, plan }) => {
              const urgent =
                mode === "purchase"
                  ? plan.purchaseIsOverdue
                  : plan.searchIsOverdue;
              const actionDate =
                mode === "purchase"
                  ? plan.purchaseStartsOn
                  : plan.searchStartsOn;
              const actionTooltip =
                mode === "purchase"
                  ? plan.tooltips.purchase
                  : plan.tooltips.search;
              const actionLabel =
                mode === "purchase" ? "Comprar em" : "Buscar em";
              const imageUrl = bestItemImageUrl(item);
              const sku = getItemSku(item);

              return (
                <li
                  key={`${mode}-${item.id}`}
                  className={cn(
                    "rounded-lg border bg-[var(--card)] px-3 py-2.5 transition-colors hover:bg-[var(--muted)]/20",
                    urgent
                      ? "border-rose-200 bg-rose-50/40"
                      : "border-[var(--border)]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Link
                      href={`/dashboard/items/${item.id}`}
                      className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)] ring-offset-2 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      aria-label={`Abrir detalhes: ${item.title}`}
                    >
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt=""
                          width={80}
                          height={80}
                          className="size-14 object-contain sm:size-16"
                          sizes="64px"
                        />
                      ) : (
                        <div className="flex size-14 items-center justify-center sm:size-16">
                          <ImageOff
                            className="size-6 text-[var(--muted-foreground)]/70"
                            aria-hidden
                          />
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-start justify-between gap-1.5">
                        <Link
                          href={`/dashboard/items/${item.id}`}
                          className="min-w-0 flex-1 underline-offset-2 hover:underline"
                          title={item.title}
                        >
                          <span className="block truncate text-sm font-semibold leading-snug text-[var(--primary)] sm:text-base">
                            {sku ?? "Sem SKU"}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-normal leading-snug text-[var(--muted-foreground)]">
                            {item.title}
                          </span>
                        </Link>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          {item.catalog_listing ? (
                            <Badge
                              variant="secondary"
                              className="h-6 px-2 text-[11px]"
                            >
                              Catálogo
                            </Badge>
                          ) : null}
                          {urgent ? (
                            <Badge
                              variant="overdue"
                              className="h-6 px-2 text-[11px]"
                            >
                              Atrasado
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="h-6 px-2 text-[11px]"
                            >
                              Hoje
                            </Badge>
                          )}
                          <button
                            type="button"
                            className="h-6 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void acknowledge(item.id)}
                            disabled={savingId === item.id}
                          >
                            {savingId === item.id ? "Salvando..." : buttonLabel}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                        <span className="tabular-nums">
                          Estoque:{" "}
                          <span className="font-semibold text-[var(--foreground)]">
                            {item.available_quantity}
                          </span>
                        </span>
                        <MetricWithHint content={plan.tooltips.stockWillLast}>
                          <span>
                            Cobertura:{" "}
                            <span className="font-semibold text-[var(--foreground)]">
                              {plan.stockWillLast}
                            </span>
                          </span>
                        </MetricWithHint>
                        <MetricWithHint content={actionTooltip}>
                          <span>
                            {actionLabel}:{" "}
                            <span
                              className={cn(
                                "font-semibold",
                                urgent
                                  ? "text-rose-900"
                                  : "text-[var(--foreground)]",
                              )}
                            >
                              {actionDate ?? "—"}
                            </span>
                          </span>
                        </MetricWithHint>
                        {mode === "full" ? (
                          <MetricWithHint content={plan.tooltips.activeStock}>
                            <span>
                              Ativo em:{" "}
                              <span className="font-semibold text-[var(--foreground)]">
                                {plan.activeStockOn ?? "—"}
                              </span>
                            </span>
                          </MetricWithHint>
                        ) : null}
                        <span className="font-mono text-[11px]">{item.id}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardAttentionPanel({
  items,
  salesByItem,
  purchaseLeadTimeByItem,
  warehouseStockByItem,
  acknowledgements,
}: {
  items: ItemBody[];
  salesByItem: Record<string, number>;
  purchaseLeadTimeByItem: Record<string, number | null>;
  warehouseStockByItem: Record<string, number>;
  acknowledgements: StockAttentionAcknowledgementView[];
}) {
  const w = stockPlanningConfig.salesAverageWindowDays;
  const [optimisticHidden, setOptimisticHidden] = useState<Set<string>>(
    () => new Set(),
  );
  const acknowledgementByKey = new Map(
    acknowledgements.map((ack) => [`${ack.kind}:${ack.mlItemId}`, ack]),
  );

  function hasValidAcknowledgement(
    kind: StockAttentionKind,
    item: ItemBody,
    warehouseStock: number,
    purchaseLeadTimeDays: number,
  ) {
    if (optimisticHidden.has(`${kind}:${item.id}`)) return true;
    const ack = acknowledgementByKey.get(`${kind}:${item.id}`);
    if (!ack) return false;
    return (
      ack.mlAvailableQuantity === item.available_quantity &&
      ack.warehouseQuantity === warehouseStock &&
      (ack.purchaseLeadTimeDays ?? 0) === purchaseLeadTimeDays
    );
  }

  async function acknowledge(itemId: string, kind: StockAttentionKind) {
    const key = `${kind}:${itemId}`;
    setOptimisticHidden((current) => new Set(current).add(key));
    try {
      const response = await fetch(
        `/api/stock-attention/${encodeURIComponent(itemId)}/ack`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        },
      );
      if (!response.ok) {
        setOptimisticHidden((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        return false;
      }
      return true;
    } catch {
      setOptimisticHidden((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return false;
    }
  }

  const rows = items.map((item) => {
    const sold = salesByItem[item.id] ?? 0;
    const purchaseLead = purchaseLeadTimeByItem[item.id] ?? 0;
    const warehouseStock = warehouseStockByItem[item.id] ?? 0;
    const fullPlan = computeStockPlanningDisplay(
      item.available_quantity,
      sold,
      w,
      stockPlanningConfig,
      purchaseLead,
    );
    const purchasePlan = computeStockPlanningDisplay(
      item.available_quantity + warehouseStock,
      sold,
      w,
      stockPlanningConfig,
      purchaseLead,
    );
    return { item, fullPlan, purchasePlan, warehouseStock, purchaseLead };
  });

  const fullRows = rows
    .filter(
      ({ item, fullPlan, warehouseStock, purchaseLead }) =>
        fullPlan.needsSchedulingAttention &&
        !hasValidAcknowledgement("full", item, warehouseStock, purchaseLead),
    )
    .sort((a, b) => {
      if (a.fullPlan.searchIsOverdue !== b.fullPlan.searchIsOverdue) {
        return a.fullPlan.searchIsOverdue ? -1 : 1;
      }
      return (
        (a.fullPlan.searchStartsAtMs ?? 0) - (b.fullPlan.searchStartsAtMs ?? 0)
      );
    })
    .map(({ item, fullPlan }) => ({ item, plan: fullPlan }));

  const purchaseRows = rows
    .filter(
      ({ item, purchasePlan, warehouseStock, purchaseLead }) =>
        purchasePlan.needsPurchaseAttention &&
        !hasValidAcknowledgement(
          "purchase",
          item,
          warehouseStock,
          purchaseLead,
        ),
    )
    .sort((a, b) => {
      if (
        a.purchasePlan.purchaseIsOverdue !== b.purchasePlan.purchaseIsOverdue
      ) {
        return a.purchasePlan.purchaseIsOverdue ? -1 : 1;
      }
      return (
        (a.purchasePlan.purchaseStartsAtMs ?? 0) -
        (b.purchasePlan.purchaseStartsAtMs ?? 0)
      );
    })
    .map(({ item, purchasePlan, warehouseStock }) => ({
      item,
      plan: purchasePlan,
      warehouseStock,
    }));

  return (
    <TooltipProvider delayDuration={200}>
      <section id="prioridades" className="scroll-mt-24 space-y-4">
        <AttentionSection
          title="Precisa enviar para Full"
          description="A data para iniciar busca/agendamento de envio ao Full chegou ou passou."
          countVariant="warning"
          rows={fullRows}
          mode="full"
          onAcknowledge={acknowledge}
        />
        <DashboardAttentionPurchasePanel
          rows={purchaseRows}
          onAcknowledge={acknowledge}
        />
      </section>
    </TooltipProvider>
  );
}
