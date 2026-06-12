"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatFinancialMoney,
  formatFinancialPercent,
} from "@/lib/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { cn } from "@/lib/utils";

type ApiResponse = {
  items: FinancialEvaluationRow[];
};

function marginTone(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) {
    return "text-[var(--muted-foreground)]";
  }
  if (margin > 0) return "text-emerald-600";
  if (margin < 0) return "text-rose-600";
  return "text-[var(--muted-foreground)]";
}

export function FinancialEvaluationClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinancialEvaluationRow[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredItems = useMemo(
    () =>
      data
        ? filterByItemListSearch(data, searchQuery, (row) => ({
            sku: row.sku,
            title: row.title,
            mlItemId: row.mlItemId,
          }))
        : [],
    [data, searchQuery],
  );

  const selectedRow = useMemo(
    () => data?.find((row) => row.mlItemId === selectedId) ?? null,
    [data, selectedId],
  );

  const loadData = useCallback(async (itemIds?: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/financial-evaluation", window.location.origin);
      if (itemIds?.length) {
        url.searchParams.set("itemIds", itemIds.join(","));
      }
      const res = await fetch(url.toString());
      const json = (await res.json()) as ApiResponse | { error?: string };
      if (!res.ok) {
        setError(
          (json as { error?: string }).error ??
            "Falha ao carregar avaliação financeira.",
        );
        return;
      }
      setData((json as ApiResponse).items);
    } catch {
      setError("Falha de rede ao carregar avaliação financeira.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <Card className="border-[var(--border)]">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
          <CardTitle className="text-lg">Anúncios ativos e pausados</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <ItemListSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Buscar por SKU, título ou MLB…"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loading}
              onClick={() => void loadData()}
            >
              <RefreshCw
                className={cn("size-4", loading && "animate-spin")}
                aria-hidden
              />
              Recalcular
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          {loading && !data ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Carregando margens…
            </p>
          ) : null}

          {data && filteredItems.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {itemListSearchEmptyMessage(searchQuery)}
            </p>
          ) : null}

          {data && filteredItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                    <th className="px-2 py-2 font-medium">Produto</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium text-right">Preço</th>
                    <th className="px-2 py-2 font-medium text-right">
                      Margem %
                    </th>
                    <th className="px-2 py-2 font-medium text-right">
                      Margem R$
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => {
                    const marginValue = row.breakdown?.marginValue ?? null;
                    const marginPercent = row.breakdown?.marginPercent ?? null;
                    return (
                      <tr
                        key={row.mlItemId}
                        className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]/30"
                        onClick={() => setSelectedId(row.mlItemId)}
                      >
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-3">
                            {row.imageUrl ? (
                              <Image
                                src={row.imageUrl}
                                alt=""
                                width={40}
                                height={40}
                                className="size-10 rounded-md object-cover"
                              />
                            ) : (
                              <div className="size-10 rounded-md bg-[var(--muted)]" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {row.sku ?? row.title}
                              </p>
                              <p className="truncate text-xs text-[var(--muted-foreground)]">
                                {row.mlItemId}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          {row.listingTypeLabel ?? "—"}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <div>{formatFinancialMoney(row.salePrice)}</div>
                          {row.hasPromotion && row.regularPrice != null ? (
                            <div className="text-xs text-[var(--muted-foreground)] line-through">
                              {formatFinancialMoney(row.regularPrice)}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-3 text-right font-medium",
                            marginTone(marginPercent),
                          )}
                        >
                          {formatFinancialPercent(marginPercent)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-3 text-right font-medium",
                            marginTone(marginValue),
                          )}
                        >
                          {formatFinancialMoney(marginValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedRow ? (
        <FinancialDetailModal
          row={selectedRow}
          onClose={() => setSelectedId(null)}
          onSaved={() => {
            void loadData([selectedRow.mlItemId]);
          }}
        />
      ) : null}
    </div>
  );
}

function FinancialDetailModal({
  row,
  onClose,
  onSaved,
}: {
  row: FinancialEvaluationRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labelId = useId();
  const [lastPurchasePrice, setLastPurchasePrice] = useState(
    row.productCost != null ? String(row.productCost) : "",
  );
  const [extraCosts, setExtraCosts] = useState(
    row.extraCosts != null ? String(row.extraCosts) : "",
  );
  const [taxRatePercent, setTaxRatePercent] = useState(
    row.taxRatePercent != null ? String(row.taxRatePercent) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLastPurchasePrice(
      row.productCost != null ? String(row.productCost) : "",
    );
    setExtraCosts(row.extraCosts != null ? String(row.extraCosts) : "");
    setTaxRatePercent(
      row.taxRatePercent != null ? String(row.taxRatePercent) : "",
    );
  }, [row.mlItemId, row.productCost, row.extraCosts, row.taxRatePercent]);

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

  function parseOptionalMoney(value: string): number | null | "invalid" {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return n;
  }

  function parseOptionalPercent(value: string): number | null | "invalid" {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return "invalid";
    return n;
  }

  async function submit() {
    const productCost = parseOptionalMoney(lastPurchasePrice);
    const extras = parseOptionalMoney(extraCosts);
    const tax = parseOptionalPercent(taxRatePercent);

    if (
      productCost === "invalid" ||
      extras === "invalid" ||
      tax === "invalid"
    ) {
      setError("Informe valores válidos ou deixe em branco.");
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
          body: JSON.stringify({
            lastPurchasePrice: productCost,
            extraCosts: extras,
            taxRatePercent: tax,
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
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id={labelId}
                className="text-lg font-semibold text-[var(--primary)]"
              >
                {row.sku ?? row.title}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {row.mlItemId} · {row.listingTypeLabel ?? "Tipo desconhecido"}
                {row.hasPromotion ? " · em promoção" : ""}
              </p>
              {row.hasPromotion && row.regularPrice != null ? (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Preço de venda: {formatFinancialMoney(row.salePrice)}{" "}
                  <span className="line-through">
                    {formatFinancialMoney(row.regularPrice)}
                  </span>
                </p>
              ) : null}
            </div>
            <Link
              href={row.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
            >
              Ver no ML
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </div>

          {row.errors.length > 0 ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {row.errors.join(" ")}
            </div>
          ) : null}

          {row.warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {row.warnings.join(" ")}
            </div>
          ) : null}

          {row.breakdown ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                    <th className="py-2 pr-4 font-medium">Item</th>
                    <th className="py-2 pr-4 font-medium text-right">Valor</th>
                    <th className="py-2 font-medium text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {row.breakdown.lines.map((line) => (
                    <tr
                      key={line.key}
                      className={cn(
                        "border-b border-[var(--border)]",
                        line.key === "margin" && "font-semibold",
                      )}
                    >
                      <td className="py-2 pr-4">{line.label}</td>
                      <td className="py-2 pr-4 text-right">
                        {formatFinancialMoney(line.value)}
                      </td>
                      <td className="py-2 text-right">
                        {formatFinancialPercent(line.percentOfSale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="text-sm font-semibold">Custos editáveis</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="product-cost"
                  className="block text-sm font-medium"
                >
                  Custo do produto (R$)
                </label>
                <input
                  id="product-cost"
                  type="text"
                  inputMode="decimal"
                  value={lastPurchasePrice}
                  onChange={(e) => setLastPurchasePrice(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="extra-costs"
                  className="block text-sm font-medium"
                >
                  Custos extras (R$)
                </label>
                <input
                  id="extra-costs"
                  type="text"
                  inputMode="decimal"
                  value={extraCosts}
                  onChange={(e) => setExtraCosts(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="tax-rate" className="block text-sm font-medium">
                  Alíquota impostos (%)
                </label>
                <input
                  id="tax-rate"
                  type="text"
                  inputMode="decimal"
                  value={taxRatePercent}
                  onChange={(e) => setTaxRatePercent(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving ? "Salvando…" : "Salvar e recalcular"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
