"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FormInput } from "@/components/ui/form-input";
import { COST_COLOR, PROFIT_COLOR } from "@/components/marketing/cost-palette";
import { OAuthCta } from "@/components/marketing/OauthCta";
import {
  computeFinancialMargin,
  computeMarginAfterAds,
  formatFinancialMoney,
  formatFinancialPercent,
  roundMoney,
} from "@/lib/pricing/financial-margin";
import { cn } from "@/lib/utils";

/**
 * Calculadora pública de margem. Importa `computeFinancialMargin` /
 * `computeMarginAfterAds`, exatamente as funções que o painel usa nas telas
 * de Lucratividade e Precificação. O número que o visitante vê aqui é o mesmo
 * que ele veria logado, só que com dados digitados em vez de vindos da ML.
 */

type ListingType = "classico" | "premium";

const LISTING: Record<
  ListingType,
  { label: string; feePercent: number; note: string }
> = {
  classico: {
    label: "Clássico",
    feePercent: 12,
    note: "Exposição padrão, sem parcelamento sem juros por conta do vendedor.",
  },
  premium: {
    label: "Premium",
    feePercent: 17,
    note: "Mais exposição e parcelamento sem juros. Em troca, a comissão sobe.",
  },
};

type FieldKey =
  | "salePrice"
  | "productCost"
  | "shipping"
  | "taxPercent"
  | "tacosPercent"
  | "monthlyUnits";

const DEFAULTS: Record<FieldKey, string> = {
  salePrice: "149,90",
  productCost: "78,00",
  shipping: "0",
  taxPercent: "12",
  tacosPercent: "7",
  monthlyUnits: "120",
};

/** Aceita "1.234,56" e "1234.56": o vendedor digita do jeito que está acostumado. */
function parseNumber(raw: string): number {
  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function Field({
  label,
  unit,
  value,
  onChange,
  hint,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="relative">
        <FormInput
          label={label}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          inputClassName="pr-10 bg-white font-medium tabular-nums"
        />
        <span
          className="pointer-events-none absolute bottom-0 right-3 flex h-11 items-center text-xs font-semibold text-[var(--muted-foreground)] sm:h-10"
          aria-hidden
        >
          {unit}
        </span>
      </div>
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function verdict(afterAdsPercent: number | null) {
  if (afterAdsPercent === null) {
    return { variant: "muted" as const, label: "Informe um preço" };
  }
  if (afterAdsPercent < 0) {
    return { variant: "destructive" as const, label: "Vendendo no prejuízo" };
  }
  if (afterAdsPercent < 10) {
    return { variant: "warning" as const, label: "Margem apertada" };
  }
  return { variant: "success" as const, label: "Margem saudável" };
}

export function MarginCalculator({
  isLoggedIn,
  dashboardHref,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
}) {
  const [listing, setListing] = useState<ListingType>("classico");
  const [fields, setFields] = useState<Record<FieldKey, string>>(DEFAULTS);

  const setField = (key: FieldKey) => (next: string) => {
    setFields((prev) => ({ ...prev, [key]: next }));
  };

  const result = useMemo(() => {
    const salePrice = Math.max(0, parseNumber(fields.salePrice));
    const productCost = Math.max(0, parseNumber(fields.productCost));
    const shipping = Math.max(0, parseNumber(fields.shipping));
    const taxPercent = Math.max(0, parseNumber(fields.taxPercent));
    const tacosPercent = Math.max(0, parseNumber(fields.tacosPercent));
    const monthlyUnits = Math.max(0, Math.round(parseNumber(fields.monthlyUnits)));
    const feePercent = LISTING[listing].feePercent;
    const mlFeeAmount = roundMoney(salePrice * (feePercent / 100));

    const breakdown = computeFinancialMargin({
      salePrice,
      mlFeeAmount,
      shippingCost: shipping,
      productCost,
      extraCosts: 0,
      taxRatePercent: taxPercent,
      listingTypeLabel: LISTING[listing].label,
    });

    const afterAds = computeMarginAfterAds({
      marginBreakdown: breakdown,
      tacosPercent,
      adsCost: null,
      unitsSold: monthlyUnits || null,
    });

    const adsValue = roundMoney(salePrice * (tacosPercent / 100));
    const taxValue = roundMoney(salePrice * (taxPercent / 100));
    const netPerUnit = afterAds?.marginAfterAdsValue ?? breakdown.marginValue;

    const segments = [
      { key: "productCost", label: "Custo do produto", value: productCost },
      { key: "mlFee", label: `Comissão ${LISTING[listing].label}`, value: mlFeeAmount },
      { key: "shipping", label: "Frete por venda", value: shipping },
      { key: "tax", label: "Imposto", value: taxValue },
      { key: "ads", label: "Product Ads", value: adsValue },
    ] as const;

    return {
      salePrice,
      feePercent,
      monthlyUnits,
      marginPercent: breakdown.marginPercent,
      marginValue: breakdown.marginValue,
      afterAdsPercent: afterAds?.marginAfterAdsPercent ?? null,
      afterAdsValue: netPerUnit,
      monthlyProfit: roundMoney(netPerUnit * monthlyUnits),
      segments,
    };
  }, [fields, listing]);

  const { salePrice, segments, afterAdsValue } = result;
  const leftover = Math.max(0, afterAdsValue);
  const barTotal = segments.reduce((sum, s) => sum + s.value, 0) + leftover;
  const widthOf = (value: number) =>
    barTotal > 0 ? `${(value / barTotal) * 100}%` : "0%";

  const tone = verdict(result.afterAdsPercent);
  const negative = (result.afterAdsPercent ?? 0) < 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_1px_2px_rgba(15,18,31,0.04),0_24px_48px_-32px_rgba(27,45,111,0.35)]">
      <div className="grid lg:grid-cols-[1fr_1.05fr]">
        {/* Entradas */}
        <div className="border-b border-[var(--border)] bg-[var(--background)] p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Seus números
            </p>
            <div
              role="radiogroup"
              aria-label="Tipo de anúncio"
              className="inline-flex rounded-full border border-[var(--border)] bg-white p-1"
            >
              {(Object.keys(LISTING) as ListingType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={listing === key}
                  onClick={() => setListing(key)}
                  className={cn(
                    "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    listing === key
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted-foreground)] hover:text-[var(--primary)]",
                  )}
                >
                  {LISTING[key].label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {LISTING[listing].note} Comissão estimada em{" "}
            <strong className="font-semibold text-[var(--foreground)]">
              {result.feePercent}%
            </strong>
            . Ajuste os demais campos com os dados da sua loja.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field
              label="Preço de venda"
              unit="R$"
              value={fields.salePrice}
              onChange={setField("salePrice")}
            />
            <Field
              label="Custo do produto"
              unit="R$"
              value={fields.productCost}
              onChange={setField("productCost")}
              hint="Custo de nota, já com ST se houver."
            />
            <Field
              label="Frete por venda"
              unit="R$"
              value={fields.shipping}
              onChange={setField("shipping")}
              hint="O que sai do seu bolso, não o que o comprador paga."
            />
            <Field
              label="Imposto"
              unit="%"
              value={fields.taxPercent}
              onChange={setField("taxPercent")}
              hint="Alíquota efetiva do DAS ou carga do lucro real."
            />
            <Field
              label="Product Ads (TACOS)"
              unit="%"
              value={fields.tacosPercent}
              onChange={setField("tacosPercent")}
              hint="Investimento em ads sobre a receita."
            />
            <Field
              label="Vendas por mês"
              unit="un"
              value={fields.monthlyUnits}
              onChange={setField("monthlyUnits")}
            />
          </div>

          <p className="mt-6 border-t border-[var(--border)] pt-5 text-xs leading-relaxed text-[var(--muted-foreground)]">
            <strong className="font-semibold text-[var(--foreground)]">
              O que esta conta não inclui:
            </strong>{" "}
            a tarifa fixa cobrada em itens de valor baixo, descontos de tarifa
            e campanhas, devoluções e o rateio de custos fixos da operação.
            Conectado, o painel puxa cada um desses itens da fatura e do seu
            cadastro, por isso o número de lá costuma ser mais duro que o
            daqui.
          </p>
        </div>

        {/* Resultado */}
        <div className="flex flex-col p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Margem depois do ADS
              </p>
              <p
                className={cn(
                  "mt-2 text-[clamp(2.5rem,7vw,3.75rem)] font-bold leading-none tabular-nums",
                  negative ? "text-rose-600" : "text-emerald-600",
                )}
              >
                {formatFinancialPercent(result.afterAdsPercent)}
              </p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    negative ? "text-rose-600" : "text-[var(--foreground)]",
                  )}
                >
                  {formatFinancialMoney(afterAdsValue)}
                </span>{" "}
                por unidade vendida
              </p>
            </div>
            <Badge variant={tone.variant} dot>
              {tone.label}
            </Badge>
          </div>

          {/* Para onde vai cada real do preço */}
          <div className="mt-7">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              {segments.map((segment) => (
                <div
                  key={segment.key}
                  style={{
                    width: widthOf(segment.value),
                    backgroundColor: COST_COLOR[segment.key],
                  }}
                  className="transition-[width] duration-300"
                />
              ))}
              {leftover > 0 ? (
                <div
                  style={{
                    width: widthOf(leftover),
                    backgroundColor: PROFIT_COLOR,
                  }}
                  className="transition-[width] duration-300"
                />
              ) : null}
            </div>

            <dl className="mt-5 space-y-2.5">
              {segments.map((segment) => (
                <div
                  key={segment.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <dt className="flex min-w-0 items-center gap-2 text-[var(--muted-foreground)]">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: COST_COLOR[segment.key] }}
                      aria-hidden
                    />
                    <span className="truncate">{segment.label}</span>
                  </dt>
                  <dd className="shrink-0 text-right tabular-nums">
                    <span className="font-medium text-[var(--foreground)]">
                      {formatFinancialMoney(segment.value)}
                    </span>
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                      {salePrice > 0
                        ? formatFinancialPercent(
                            roundMoney((segment.value / salePrice) * 100),
                          )
                        : "—"}
                    </span>
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-sm">
                <dt className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PROFIT_COLOR }}
                    aria-hidden
                  />
                  O que sobra
                </dt>
                <dd
                  className={cn(
                    "shrink-0 text-right font-semibold tabular-nums",
                    negative ? "text-rose-600" : "text-emerald-600",
                  )}
                >
                  {formatFinancialMoney(afterAdsValue)}
                  <span className="ml-2 text-xs font-normal">
                    {formatFinancialPercent(result.afterAdsPercent)}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div
            className={cn(
              "mt-6 rounded-xl border px-4 py-3.5",
              negative
                ? "border-rose-200 bg-rose-50"
                : "border-emerald-200 bg-emerald-50",
            )}
          >
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              {negative ? "Prejuízo no mês" : "Resultado no mês"} ·{" "}
              {result.monthlyUnits.toLocaleString("pt-BR")} vendas
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-bold tabular-nums",
                negative ? "text-rose-700" : "text-emerald-700",
              )}
            >
              {formatFinancialMoney(result.monthlyProfit)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
              Margem de contribuição antes do ADS:{" "}
              <strong className="font-semibold text-[var(--foreground)]">
                {formatFinancialPercent(result.marginPercent)}
              </strong>{" "}
              ({formatFinancialMoney(result.marginValue)} por venda).
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Um anúncio de cada vez, com números digitados. Conectado, o
                painel faz essa conta para o catálogo inteiro, com a tarifa e o
                ADS reais da sua fatura.
              </span>
            </p>
            <OAuthCta
              isLoggedIn={isLoggedIn}
              dashboardHref={dashboardHref}
              size="sm"
              className="shrink-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
