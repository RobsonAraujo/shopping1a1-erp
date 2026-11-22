import { COST_COLOR, PROFIT_COLOR } from "@/components/marketing/cost-palette";
import {
  computeFinancialMargin,
  computeMarginAfterAds,
  formatFinancialMoney,
  formatFinancialPercent,
  percentOfSale,
  roundMoney,
} from "@/lib/pricing/financial-margin";

/**
 * Uma venda de exemplo, real a real, para a seção de dor da `/beta`. Os
 * números saem das mesmas funções de margem do painel (nada digitado à mão),
 * com as alíquotas padrão da calculadora pública de margem.
 */
const EXAMPLE = {
  salePrice: 159.9,
  productCost: 84,
  shipping: 22.9,
  feePercent: 12,
  taxPercent: 12,
  tacosPercent: 7,
} as const;

function buildExample() {
  const mlFeeAmount = roundMoney(EXAMPLE.salePrice * (EXAMPLE.feePercent / 100));
  const breakdown = computeFinancialMargin({
    salePrice: EXAMPLE.salePrice,
    mlFeeAmount,
    shippingCost: EXAMPLE.shipping,
    productCost: EXAMPLE.productCost,
    extraCosts: 0,
    taxRatePercent: EXAMPLE.taxPercent,
    listingTypeLabel: "Clássico",
  });
  const afterAds = computeMarginAfterAds({
    marginBreakdown: breakdown,
    tacosPercent: EXAMPLE.tacosPercent,
    adsCost: null,
    unitsSold: null,
  });

  const leftover = afterAds?.marginAfterAdsValue ?? breakdown.marginValue;
  const segments = [
    { key: "productCost", label: "Custo do produto", value: EXAMPLE.productCost },
    { key: "mlFee", label: "Comissão do Clássico", value: mlFeeAmount },
    { key: "shipping", label: "Frete grátis (pago por você)", value: EXAMPLE.shipping },
    {
      key: "tax",
      label: "Imposto",
      value: roundMoney(EXAMPLE.salePrice * (EXAMPLE.taxPercent / 100)),
    },
    {
      key: "ads",
      label: "Product Ads",
      value: roundMoney(EXAMPLE.salePrice * (EXAMPLE.tacosPercent / 100)),
    },
  ] as const;

  return {
    segments,
    leftover,
    // O mesmo "pós ADS %" do painel (margem − TACOS), não o valor recalculado.
    leftoverPercent:
      afterAds?.marginAfterAdsPercent ??
      percentOfSale(leftover, EXAMPLE.salePrice),
    looksLike: roundMoney(EXAMPLE.salePrice - EXAMPLE.productCost),
  };
}

export function BetaMoneyLeak() {
  const { segments, leftover, leftoverPercent, looksLike } = buildExample();
  const barTotal = EXAMPLE.salePrice;
  const widthOf = (value: number) =>
    `${(Math.max(0, value) / barTotal) * 100}%`;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(15,18,31,0.04),0_24px_48px_-32px_rgba(27,45,111,0.35)]">
      <div className="border-b border-[var(--border)] bg-[var(--background)] px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Exemplo
        </p>
        <p className="mt-1 text-base font-semibold text-[var(--foreground)]">
          Uma venda de {formatFinancialMoney(EXAMPLE.salePrice)} no Clássico
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[var(--muted)] p-4">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Preço menos custo
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--muted-foreground)] line-through decoration-rose-500/70 decoration-2 sm:text-3xl">
              {formatFinancialMoney(looksLike)}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              o que parece sobrar
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="text-xs font-medium text-amber-900">
              Sobra de verdade
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700 sm:text-3xl">
              {formatFinancialMoney(leftover)}
            </p>
            <p className="mt-1 text-xs text-amber-900/80">
              {formatFinancialPercent(leftoverPercent)} do preço
            </p>
          </div>
        </div>

        <div
          className="mt-6 flex h-3 w-full overflow-hidden rounded-full bg-[var(--muted)]"
          role="img"
          aria-label={`De ${formatFinancialMoney(EXAMPLE.salePrice)}, sobram ${formatFinancialMoney(leftover)}`}
        >
          {segments.map((s) => (
            <span
              key={s.key}
              className="h-full"
              style={{ width: widthOf(s.value), backgroundColor: COST_COLOR[s.key] }}
            />
          ))}
          <span
            className="h-full"
            style={{ width: widthOf(leftover), backgroundColor: PROFIT_COLOR }}
          />
        </div>

        <dl className="mt-5 divide-y divide-[var(--border)] text-sm">
          {segments.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 py-2">
              <dt className="flex min-w-0 items-center gap-2 text-[var(--muted-foreground)]">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COST_COLOR[s.key] }}
                  aria-hidden
                />
                {s.label}
              </dt>
              <dd className="shrink-0 font-medium tabular-nums text-rose-700">
                − {formatFinancialMoney(s.value)}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: PROFIT_COLOR }}
                aria-hidden
              />
              Sobra no seu bolso
            </dt>
            <dd className="shrink-0 font-bold tabular-nums text-emerald-700">
              {formatFinancialMoney(leftover)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 border-t border-[var(--border)] pt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Exemplo com comissão de {EXAMPLE.feePercent}%, frete de{" "}
          {formatFinancialMoney(EXAMPLE.shipping)} pago pelo vendedor, imposto de{" "}
          {EXAMPLE.taxPercent}% e Product Ads (TACOS) de {EXAMPLE.tacosPercent}%.
          Conectado, cada linha vem da sua fatura e do seu cadastro.
        </p>
      </div>
    </div>
  );
}
