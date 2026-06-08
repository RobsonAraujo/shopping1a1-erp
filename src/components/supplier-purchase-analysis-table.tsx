"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { ExternalLink, ImageOff, Settings } from "lucide-react";
import type { PurchaseAnalysisItemRow } from "@/lib/dashboard-purchase-data";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import type {
  PurchasePerformanceTier,
  PurchaseRecommendation,
  PurchaseStatus,
} from "@/lib/purchase-analysis";
import { MetricWithHint } from "@/components/metric-with-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  evitar: "Evitar reposição",
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
    <TooltipProvider delayDuration={200}>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[72rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
              <tr>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Produto
                </th>
                <th className="min-w-[8.5rem] px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Estoque
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Vendas 14d
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Cobertura
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Rotação
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Status
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Qtd. sugerida
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Recomendação
                </th>
                {showCostColumns ? (
                  <th className="min-w-[12rem] px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Custos
                  </th>
                ) : null}
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
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
                  return (
                    <tr
                      key={row.item.id}
                      className={cn(
                        "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40",
                        analysis.purchaseStatus === "urgente" &&
                          "bg-rose-50/30",
                      )}
                    >
                      <td className="align-middle px-4 py-3.5">
                        <div className="flex gap-3">
                          <Link
                            href={`/dashboard/items/${row.item.id}`}
                            className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                          >
                            {imageUrl ? (
                              <Image
                                src={imageUrl}
                                alt=""
                                width={80}
                                height={80}
                                className="size-12 object-contain sm:size-14"
                                sizes="56px"
                              />
                            ) : (
                              <span className="flex size-12 items-center justify-center sm:size-14">
                                <ImageOff
                                  className="size-5 text-[var(--muted-foreground)]/60"
                                  aria-hidden
                                />
                              </span>
                            )}
                          </Link>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="block truncate font-semibold leading-snug text-[var(--foreground)]"
                                title={row.item.title}
                              >
                                {row.sku ?? "Sem SKU"}
                              </span>
                              {catalogLabel ? (
                                <Badge
                                  variant="outline"
                                  className="h-5 px-1.5 text-[10px]"
                                >
                                  {catalogLabel}
                                </Badge>
                              ) : null}
                            </span>
                            <span
                              className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]"
                              title={row.item.title}
                            >
                              {row.item.title}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="min-w-[8.5rem] align-middle px-4 py-3.5 text-xs whitespace-nowrap tabular-nums">
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
                      <td className="align-middle px-4 py-3.5 tabular-nums">
                        <div>{row.unitsSold}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {analysis.dailyAvg.toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}
                          /dia
                        </div>
                      </td>
                      <td className="align-middle px-4 py-3.5 tabular-nums text-[var(--muted-foreground)]">
                        {formatCoverage(analysis.coverageDays)}
                      </td>
                      <td className="align-middle px-4 py-3.5">
                        <Badge
                          variant={
                            performanceVariants[analysis.performanceTier]
                          }
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {performanceLabels[analysis.performanceTier]}
                        </Badge>
                      </td>
                      <td className="align-middle px-4 py-3.5">
                        <Badge
                          variant={statusVariants[analysis.purchaseStatus]}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {statusLabels[analysis.purchaseStatus]}
                        </Badge>
                      </td>
                      <td className="align-middle px-4 py-3.5 tabular-nums font-medium">
                        <MetricWithHint
                          content={analysis.recommendationTooltip}
                        >
                          <span>{analysis.suggestedQty}</span>
                        </MetricWithHint>
                      </td>
                      <td className="align-middle px-4 py-3.5">
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
                        <td className="min-w-[12rem] align-middle px-4 py-3.5 text-xs whitespace-nowrap">
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
                      <td className="align-middle px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
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
