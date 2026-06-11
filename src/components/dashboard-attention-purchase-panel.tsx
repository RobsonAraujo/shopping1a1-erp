"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ImageOff, ShoppingCart } from "lucide-react";
import { AttentionPanelCollapseToggle } from "@/components/attention-panel-collapse-toggle";
import {
  DASHBOARD_ATTENTION_PURCHASE_OPEN_KEY,
  usePersistedOpen,
} from "@/hooks/use-persisted-open";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku, groupBySkuSupplier } from "@/lib/mercadolibre/item-sku";
import { SupplierGroupHeader } from "@/components/supplier-group-header";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { MetricWithHint } from "@/components/metric-with-hint";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ItemBody } from "@/lib/mercadolibre/types";
import type { StockPlanningDisplay } from "@/lib/stock-planning";
import type { StockAttentionKind } from "@/components/dashboard-attention-panel";

type PurchaseAttentionRow = {
  item: ItemBody;
  plan: StockPlanningDisplay;
  warehouseStock: number;
};

export function DashboardAttentionPurchasePanel({
  rows,
  onAcknowledge,
}: {
  rows: PurchaseAttentionRow[];
  onAcknowledge: (itemId: string, kind: StockAttentionKind) => Promise<boolean>;
}) {
  const panelTitle = "Precisa comprar reposição de estoque";
  const { open, toggle } = usePersistedOpen(
    DASHBOARD_ATTENTION_PURCHASE_OPEN_KEY,
    false,
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge(itemId: string) {
    setError(null);
    setSavingId(itemId);
    try {
      const ok = await onAcknowledge(itemId, "purchase");
      if (!ok) {
        setError("Não foi possível marcar compra feita.");
      }
    } finally {
      setSavingId(null);
    }
  }

  const supplierGroups = groupBySkuSupplier(rows, (row) =>
    getItemSku(row.item),
  );

  return (
    <Card className="overflow-hidden border-sky-200/90 bg-gradient-to-br from-sky-50/90 via-white to-[var(--card)] shadow-md ring-1 ring-sky-100/70">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-900">
              <ShoppingCart className="size-5" aria-hidden />
            </span>
            <CardTitle className="text-lg text-[var(--primary)]">
              {panelTitle}
            </CardTitle>
          </div>
          <CardDescription className="max-w-2xl text-sm leading-relaxed">
            Compra antecipada considerando prazo compra + prazo de entrada no
            Full.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rows.length > 0 ? (
            <Badge variant="secondary" className="px-3 py-1 text-sm">
              {rows.length} {rows.length === 1 ? "anúncio" : "anúncios"}
            </Badge>
          ) : null}
          <AttentionPanelCollapseToggle
            open={open}
            onToggle={toggle}
            panelLabel={panelTitle}
          />
        </div>
      </CardHeader>

      {open ? (
      <CardContent className="pb-4">
        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-5 text-sm text-[var(--muted-foreground)]">
            Nenhum anúncio precisa de compra no momento.
          </p>
        ) : (
          <ul className="space-y-4">
            {supplierGroups.map((group) => (
              <li key={group.supplier} className="list-none space-y-2">
                <SupplierGroupHeader
                  supplier={group.supplier}
                  count={group.rows.length}
                  showAnalyzeLink
                />
                <ul className="space-y-2.5">
                  {group.rows.map(({ item, plan, warehouseStock }) => {
                    const mlStock = mlAvailableStockUnits(item);
                    const totalStock = mlStock + warehouseStock;
                    const urgent = plan.purchaseIsOverdue;
                    const imageUrl = bestItemImageUrl(item);
                    const sku = getItemSku(item);

                    return (
                      <li
                        key={`purchase-${item.id}`}
                        className={cn(
                          "rounded-lg border bg-[var(--card)] px-3 py-2.5 transition-colors hover:bg-[var(--muted)]/20",
                          urgent
                            ? "border-rose-200 bg-rose-50/30"
                            : "border-sky-200/70 bg-sky-50/30",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Link
                            href={`/dashboard/items/${item.id}`}
                            className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
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
                                <ListingStatusBadge
                                  status={item.status}
                                  mlStock={mlStock}
                                  warehouseStock={warehouseStock}
                                />
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
                                  {savingId === item.id
                                    ? "Salvando..."
                                    : "Já comprei"}
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                              <span>
                                Estoque Galpão:{" "}
                                <span className="font-semibold text-[var(--foreground)]">
                                  {warehouseStock}
                                </span>
                              </span>
                              <span>
                                Estoque Mercado Livre:{" "}
                                <span className="font-semibold text-[var(--foreground)]">
                                  {mlStock}
                                </span>
                              </span>
                              <span>
                                Total Estoque:{" "}
                                <span className="font-semibold text-[var(--foreground)]">
                                  {totalStock}
                                </span>
                              </span>
                              <MetricWithHint
                                content={plan.tooltips.stockWillLast}
                              >
                                <span>
                                  Cobertura:{" "}
                                  <span className="font-semibold text-[var(--foreground)]">
                                    {plan.stockWillLast}
                                  </span>
                                </span>
                              </MetricWithHint>
                              <MetricWithHint content={plan.tooltips.purchase}>
                                <span>
                                  Comprar em:{" "}
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      urgent
                                        ? "text-rose-900"
                                        : "text-[var(--foreground)]",
                                    )}
                                  >
                                    {plan.purchaseStartsOn ?? "—"}
                                  </span>
                                </span>
                              </MetricWithHint>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      ) : null}
    </Card>
  );
}
