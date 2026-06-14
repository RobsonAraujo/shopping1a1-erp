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
  MaskedMoneyField,
  MaskedPercentField,
} from "@/components/financial-cost-input-fields";
import {
  computeFinancialMargin,
  computeMarginAfterAds,
  computeMinSalePriceForTargetMargin,
  formatFinancialMoney,
  formatFinancialPercent,
  marginBasisLabel,
  type MarginBasis,
  type MinSalePriceResult,
} from "@/lib/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { cn } from "@/lib/utils";

type ApiResponse = {
  items: FinancialEvaluationRow[];
};

const TARGET_MARGIN_STORAGE_KEY = "lucratividade-target-margin";
const MARGIN_BASIS_STORAGE_KEY = "lucratividade-margin-basis";
const DEFAULT_TARGET_MARGIN_PERCENT = 6;

function readStoredTargetMargin(): number {
  if (typeof window === "undefined") return DEFAULT_TARGET_MARGIN_PERCENT;
  try {
    const raw = localStorage.getItem(TARGET_MARGIN_STORAGE_KEY);
    if (raw === null) return DEFAULT_TARGET_MARGIN_PERCENT;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return DEFAULT_TARGET_MARGIN_PERCENT;
    }
    return parsed;
  } catch {
    return DEFAULT_TARGET_MARGIN_PERCENT;
  }
}

function readStoredMarginBasis(): MarginBasis {
  if (typeof window === "undefined") return "contribution";
  try {
    const raw = localStorage.getItem(MARGIN_BASIS_STORAGE_KEY);
    return raw === "afterAds" ? "afterAds" : "contribution";
  } catch {
    return "contribution";
  }
}

type CostOverrides = {
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
};

function buildMinPriceSuggestion(
  row: FinancialEvaluationRow,
  targetMarginPercent: number,
  marginBasis: MarginBasis,
  costs: CostOverrides,
): MinSalePriceResult {
  if (
    row.mlFeeAmount === null ||
    row.shippingCost === null ||
    !row.breakdown ||
    row.salePrice <= 0
  ) {
    return {
      minSalePrice: null,
      currentMarginPercent: null,
      alreadyMeetsTarget: false,
      reason: "incomplete",
    };
  }

  const breakdown = computeFinancialMargin({
    salePrice: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    mlFeeRebate: row.mlFeeRebate ?? 0,
    shippingCost: row.shippingCost,
    productCost: costs.productCost,
    extraCosts: costs.extraCosts,
    taxRatePercent: costs.taxRatePercent,
    listingTypeLabel: row.listingTypeLabel,
  });

  const afterAds =
    row.adsMetricsAvailable && marginBasis === "afterAds"
      ? computeMarginAfterAds({
          marginBreakdown: breakdown,
          tacosPercent: row.tacosPercent,
          adsCost: row.adsCost,
          unitsSold: row.adsUnitsSold,
        })
      : null;

  return computeMinSalePriceForTargetMargin({
    salePrice: row.salePrice,
    mlFeeAmount: row.mlFeeAmount,
    mlFeeRebate: row.mlFeeRebate ?? 0,
    shippingCost: row.shippingCost,
    productCost: costs.productCost,
    extraCosts: costs.extraCosts,
    taxRatePercent: costs.taxRatePercent,
    targetMarginPercent,
    marginBasis,
    tacosPercent: row.tacosPercent,
    currentContributionMarginPercent: breakdown.marginPercent,
    currentAfterAdsMarginPercent: afterAds?.marginAfterAdsPercent ?? null,
  });
}

function marginTone(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) {
    return "text-[var(--muted-foreground)]";
  }
  if (margin > 0) return "text-emerald-600";
  if (margin < 0) return "text-rose-600";
  return "text-[var(--muted-foreground)]";
}

const currentSectionClass = "bg-[var(--muted)]/10";

const decisionSectionClass =
  "ml-4 border-l-2 border-sky-200 bg-sky-50/80 pl-4 dark:border-sky-800 dark:bg-sky-950/30";

function sectionGroupPill(variant: "current" | "decision") {
  return cn(
    "inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
    variant === "current"
      ? "bg-[var(--muted)]/40 text-[var(--muted-foreground)]"
      : "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  );
}

function StackedMarginCell({
  percent,
  value,
  sublabel,
  unavailable,
}: {
  percent: number | null;
  value: number | null;
  sublabel?: string | null;
  unavailable?: boolean;
}) {
  if (unavailable) {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }

  return (
    <div className="text-right">
      <div className={cn("font-semibold", marginTone(percent))}>
        {formatFinancialPercent(percent)}
      </div>
      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {formatFinancialMoney(value)}
      </div>
      {sublabel ? (
        <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function MinPriceTableCell({
  row,
  targetMarginPercent,
  marginBasis,
}: {
  row: FinancialEvaluationRow;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
}) {
  const suggestion = useMemo(
    () =>
      buildMinPriceSuggestion(row, targetMarginPercent, marginBasis, {
        productCost: row.productCost,
        extraCosts: row.extraCosts,
        taxRatePercent: row.taxRatePercent,
      }),
    [row, targetMarginPercent, marginBasis],
  );

  if (suggestion.reason === "missing_product_cost") {
    return (
      <span className="text-xs text-[var(--muted-foreground)]" title="Preencha o custo do produto">
        Sem custo
      </span>
    );
  }

  if (suggestion.reason === "incomplete" || suggestion.reason === "impossible") {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }

  if (suggestion.alreadyMeetsTarget) {
    return (
      <div>
        <span className="font-medium text-emerald-600" title="Preço atual já atinge a meta">
          OK
        </span>
        <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          Meta {formatFinancialPercent(targetMarginPercent)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="font-medium text-amber-700 dark:text-amber-500">
        {formatFinancialMoney(suggestion.minSalePrice)}
      </span>
      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        mín. p/ {formatFinancialPercent(targetMarginPercent)}
      </div>
    </div>
  );
}

export function FinancialEvaluationClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinancialEvaluationRow[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetMarginPercent, setTargetMarginPercent] = useState(
    readStoredTargetMargin,
  );
  const [marginBasis, setMarginBasis] = useState(readStoredMarginBasis);

  useEffect(() => {
    try {
      localStorage.setItem(
        TARGET_MARGIN_STORAGE_KEY,
        String(targetMarginPercent),
      );
    } catch {
      // ignore quota / private mode
    }
  }, [targetMarginPercent]);

  useEffect(() => {
    try {
      localStorage.setItem(MARGIN_BASIS_STORAGE_KEY, marginBasis);
    } catch {
      // ignore quota / private mode
    }
  }, [marginBasis]);

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
            "Falha ao carregar lucratividade.",
        );
        return;
      }
      setData((json as ApiResponse).items);
    } catch {
      setError("Falha de rede ao carregar lucratividade.");
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
          <div>
            <CardTitle className="text-lg">Anúncios ativos e pausados</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Clique em um anúncio para ver o detalhamento completo.
            </p>
          </div>
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
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/15 px-3 py-2">
                <p className="text-xs text-[var(--muted-foreground)]">
                  Sugestão usa meta de{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {formatFinancialPercent(targetMarginPercent)}
                  </span>{" "}
                  ({marginBasisLabel(marginBasis)}). Pós ADS: TACOS dos últimos
                  7 dias.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-36">
                    <MaskedPercentField
                      id="target-margin-percent"
                      label="Meta de margem"
                      value={targetMarginPercent}
                      onValueChange={(value) => {
                        if (value !== null && Number.isFinite(value)) {
                          setTargetMarginPercent(value);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-sm font-medium">Base da meta</span>
                    <div className="flex rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          marginBasis === "contribution" ? "default" : "ghost"
                        }
                        className="h-8 rounded-md px-3 text-xs"
                        onClick={() => setMarginBasis("contribution")}
                      >
                        Contribuição
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={marginBasis === "afterAds" ? "default" : "ghost"}
                        className="h-8 rounded-md px-3 text-xs"
                        onClick={() => setMarginBasis("afterAds")}
                      >
                        Pós ADS
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted-foreground)]">
                    <th colSpan={3} className="px-2 pt-2" />
                    <th
                      colSpan={2}
                      className={cn(
                        currentSectionClass,
                        "px-2 pt-2 pb-1 text-center",
                      )}
                    >
                      <span className={sectionGroupPill("current")}>
                        Situação atual
                      </span>
                    </th>
                    <th
                      colSpan={1}
                      className={cn(
                        decisionSectionClass,
                        "px-2 pt-2 pb-1 text-center",
                      )}
                    >
                      <span className={sectionGroupPill("decision")}>
                        Para decidir
                      </span>
                    </th>
                  </tr>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                    <th className="px-2 py-2 font-medium">Produto</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium text-right">Preço</th>
                    <th
                      className={cn(
                        currentSectionClass,
                        "px-2 py-2 font-medium text-right",
                      )}
                      title="Margem de contribuição (% em destaque, R$ abaixo)"
                    >
                      Margem
                    </th>
                    <th
                      className={cn(
                        currentSectionClass,
                        "px-2 py-2 font-medium text-right",
                      )}
                      title="Margem de contribuição menos TACOS (últimos 7 dias)"
                    >
                      Pós ADS
                    </th>
                    <th
                      className={cn(
                        decisionSectionClass,
                        "px-2 py-2 font-medium text-right",
                      )}
                      title={`Preço mínimo estimado para ${formatFinancialPercent(targetMarginPercent)} de ${marginBasisLabel(marginBasis)}`}
                    >
                      Preço p/ meta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => {
                    const marginValue = row.breakdown?.marginValue ?? null;
                    const marginPercent = row.breakdown?.marginPercent ?? null;
                    const afterAdsPercent = row.marginAfterAdsPercent;
                    const afterAdsValue = row.marginAfterAdsValue;
                    const tacosSublabel =
                      row.adsMetricsAvailable &&
                      row.tacosPercent != null &&
                      row.tacosPercent > 0
                        ? `TACOS ${formatFinancialPercent(row.tacosPercent)}`
                        : null;
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
                        <td className={cn(currentSectionClass, "px-2 py-3")}>
                          <StackedMarginCell
                            percent={marginPercent}
                            value={marginValue}
                          />
                        </td>
                        <td className={cn(currentSectionClass, "px-2 py-3")}>
                          <StackedMarginCell
                            percent={afterAdsPercent}
                            value={afterAdsValue}
                            sublabel={tacosSublabel}
                            unavailable={!row.adsMetricsAvailable}
                          />
                        </td>
                        <td
                          className={cn(
                            decisionSectionClass,
                            "px-2 py-3 text-right",
                          )}
                        >
                          <MinPriceTableCell
                            row={row}
                            targetMarginPercent={targetMarginPercent}
                            marginBasis={marginBasis}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {selectedRow ? (
        <FinancialDetailModal
          row={selectedRow}
          targetMarginPercent={targetMarginPercent}
          marginBasis={marginBasis}
          onClose={() => setSelectedId(null)}
          onSaved={() => {
            void loadData([selectedRow.mlItemId]);
          }}
        />
      ) : null}
    </div>
  );
}

function MarginPriceSuggestion({
  row,
  targetMarginPercent,
  marginBasis,
  productCost,
  extraCosts,
  taxRatePercent,
}: {
  row: FinancialEvaluationRow;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
}) {
  const suggestion = useMemo(
    () =>
      buildMinPriceSuggestion(row, targetMarginPercent, marginBasis, {
        productCost,
        extraCosts,
        taxRatePercent,
      }),
    [
      row,
      targetMarginPercent,
      marginBasis,
      productCost,
      extraCosts,
      taxRatePercent,
    ],
  );

  const basisLabel = marginBasisLabel(marginBasis);
  const targetLabel = formatFinancialPercent(targetMarginPercent);

  let message: string;
  let toneClass = "border-[var(--border)] bg-[var(--muted)]/20 text-[var(--foreground)]";

  if (suggestion.reason === "missing_product_cost") {
    message = "Preencha o custo do produto para calcular o preço mínimo sugerido.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-900";
  } else if (suggestion.reason === "incomplete") {
    message = "Dados insuficientes para sugerir preço mínimo.";
    toneClass = "border-[var(--border)] bg-[var(--muted)]/20 text-[var(--muted-foreground)]";
  } else if (suggestion.reason === "impossible") {
    message = `Com os custos atuais, não é possível atingir ${targetLabel} de ${basisLabel}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (suggestion.alreadyMeetsTarget) {
    message = `O preço atual (${formatFinancialMoney(row.salePrice)}) já atinge ${targetLabel} de ${basisLabel} (${formatFinancialPercent(suggestion.currentMarginPercent)}).`;
    toneClass = "border-emerald-200 bg-emerald-50 text-emerald-900";
  } else {
    message = `Para ter ${targetLabel} de ${basisLabel}, o preço final precisa ser pelo menos ${formatFinancialMoney(suggestion.minSalePrice)}. Preço atual: ${formatFinancialMoney(row.salePrice)} (${formatFinancialPercent(suggestion.currentMarginPercent)}).`;
    toneClass = "border-sky-200 bg-sky-50 text-sky-900";
  }

  return (
    <div className={cn("mt-4 rounded-lg border px-3 py-2 text-sm", toneClass)}>
      <p className="font-medium">Sugestão de preço</p>
      <p className="mt-1">{message}</p>
      <p className="mt-1 text-xs opacity-80">
        Estimativa com taxa ML e frete proporcionais ao preço atual.
      </p>
    </div>
  );
}

function FinancialDetailModal({
  row,
  targetMarginPercent,
  marginBasis,
  onClose,
  onSaved,
}: {
  row: FinancialEvaluationRow;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  onClose: () => void;
  onSaved: () => void;
}) {
  const labelId = useId();
  const [productCost, setProductCost] = useState<number | null>(row.productCost);
  const [extraCosts, setExtraCosts] = useState<number | null>(row.extraCosts);
  const [taxRatePercent, setTaxRatePercent] = useState<number | null>(
    row.taxRatePercent,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProductCost(row.productCost);
    setExtraCosts(row.extraCosts);
    setTaxRatePercent(row.taxRatePercent);
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

  async function submit() {
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
            extraCosts,
            taxRatePercent,
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

          {row.adsMetricsAvailable ? (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-sm">
              <span className="font-medium">Product Ads</span>
              <span className="text-[var(--muted-foreground)]">
                {" "}
                · últimos {row.adsPeriodDays} dias
                {row.tacosPercent != null
                  ? ` · TACOS ${formatFinancialPercent(row.tacosPercent)}`
                  : ""}
                {row.acosPercent != null
                  ? ` · ACOS ${formatFinancialPercent(row.acosPercent)}`
                  : ""}
                {row.adsCost != null && row.adsCost > 0
                  ? ` · gasto ${formatFinancialMoney(row.adsCost)}`
                  : ""}
                {row.adsCostPerUnit != null && row.adsCostPerUnit > 0
                  ? ` · ${formatFinancialMoney(row.adsCostPerUnit)}/un.`
                  : ""}
              </span>
            </div>
          ) : null}

          <MarginPriceSuggestion
            row={row}
            targetMarginPercent={targetMarginPercent}
            marginBasis={marginBasis}
            productCost={productCost}
            extraCosts={extraCosts}
            taxRatePercent={taxRatePercent}
          />

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
                        (line.key === "margin" || line.key === "marginAfterAds") &&
                          "font-semibold",
                        line.key === "ads" && "text-[var(--muted-foreground)]",
                        line.key === "mlFeeRebate" &&
                          "text-emerald-700 dark:text-emerald-400",
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
              <MaskedMoneyField
                key={`product-cost-${row.mlItemId}`}
                id="product-cost"
                label="Custo do produto"
                value={productCost}
                onValueChange={setProductCost}
              />
              <MaskedMoneyField
                key={`extra-costs-${row.mlItemId}`}
                id="extra-costs"
                label="Custos extras"
                value={extraCosts}
                onValueChange={setExtraCosts}
              />
              <MaskedPercentField
                key={`tax-rate-${row.mlItemId}`}
                id="tax-rate"
                label="Alíquota impostos"
                value={taxRatePercent}
                onValueChange={setTaxRatePercent}
              />
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
