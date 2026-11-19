"use client";

import { ShoppingCart } from "lucide-react";
import {
  cadastroInQuoteUnits,
  nfRuleLabel,
} from "@/components/calculadora/CalculatorPurchaseControl";
import {
  maxProductCostAtPrice,
  nfDiffersFromEffective,
  nfUnitPriceForCost,
  type CalculatorPurchaseBasis,
} from "@/lib/calculadora/purchase-cost";
import type { TacosBasis } from "@/lib/pricing/tacos-basis";
import { formatMoney, formatPercent } from "@/lib/rotina/format";
import type { SimulatedPrice } from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

const linkClass =
  "cursor-pointer rounded font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/**
 * "Na compra": o quanto dá para pagar no produto para fechar a margem mínima
 * neste preço já cotado (`maxProductCostAtPrice`, sem ir ao ML). Em produto
 * (ou kit de um produto só) o número sai em preço unitário na NF, o termo do
 * orçamento do fornecedor; o custo na conta (com IPI/ST) vem ao lado.
 */
export function CalculatorPurchaseLine({
  result,
  place,
  inputs,
  targetPercent,
  basis,
  cadastroCost,
  quote,
  adsBasis,
  onUse7d,
}: {
  result: SimulatedPrice;
  place: "latest" | "compare";
  /** Os insumos da conta, com o ADS da base escolhida (o custo não entra). */
  inputs: RotinaPricingInputs;
  targetPercent: number;
  basis: CalculatorPurchaseBasis;
  /** O custo do cadastro na conta (o do anúncio inteiro). */
  cadastroCost: number | null;
  /** O orçamento digitado, na unidade do campo; `null` = vazio. */
  quote: number | null;
  adsBasis: TacosBasis;
  onUse7d: () => void;
}) {
  if (!result.quoted || result.mlFeeAmount === null || result.shippingCost === null) return null;
  const costs = { mlFeeAmount: result.mlFeeAmount, shippingCost: result.shippingCost };
  const max = maxProductCostAtPrice(result.price, costs, inputs, targetPercent);
  const nf = basis.kind === "nf" ? basis : null;
  /** Na unidade do orçamento: NF por unidade, ou o custo da conta. */
  const shown = (cost: number) => (nf ? nfUnitPriceForCost(cost, nf) : cost);

  if (place === "compare") {
    return (
      <span className="tabular-nums">
        {max === null ? (
          "nenhum custo fecha"
        ) : (
          <>
            pague até{" "}
            <strong className="font-semibold text-[var(--foreground)]">
              {formatMoney(shown(max))}
            </strong>
          </>
        )}
      </span>
    );
  }

  const breakEven = targetPercent > 0 ? maxProductCostAtPrice(result.price, costs, inputs, 0) : null;
  const cadastro = cadastroInQuoteUnits(basis, cadastroCost);
  const unitSuffix = nf
    ? nf.units !== 1
      ? `/un na NF (kit com ${nf.units})`
      : "/un na NF"
    : basis.kind === "effective" && basis.reason === "kit"
      ? "no custo do kit"
      : "de custo";
  const details = [
    max !== null && nfDiffersFromEffective(basis)
      ? `custo na conta ${formatMoney(max)} (${nfRuleLabel(basis)})`
      : null,
    breakEven !== null ? `empate (0%) até ${formatMoney(shown(breakEven))}` : null,
    cadastro !== null ? `cadastro hoje ${formatMoney(cadastro)}` : null,
  ].filter((part) => part !== null);
  const limit = max !== null ? shown(max) : null;
  const gap = limit !== null && quote !== null ? Math.round((quote - limit) * 100) / 100 : null;
  const rebate = inputs.mlFeeRebate !== null && inputs.mlFeeRebate > 0 ? inputs.mlFeeRebate : null;

  return (
    <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-2.5 text-xs">
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <ShoppingCart
          className="size-3.5 shrink-0 self-center text-[var(--muted-foreground)]"
          aria-hidden
        />
        <span className="font-semibold text-[var(--foreground)]">Na compra:</span>
        {limit === null ? (
          <span className="text-rose-700">
            nenhum custo fecha {formatPercent(targetPercent)} a {formatMoney(result.price)}.
          </span>
        ) : (
          <>
            <span className="text-[var(--muted-foreground)]">
              para {formatPercent(targetPercent)} a {formatMoney(result.price)}, pague até
            </span>
            <strong className="text-sm font-bold tabular-nums text-[var(--foreground)]">
              {formatMoney(limit)}
            </strong>
            <span className="text-[var(--muted-foreground)]">{unitSuffix}</span>
          </>
        )}
      </p>
      {details.length > 0 ? (
        <p className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
          {details.join(" · ")}
        </p>
      ) : null}
      {gap !== null && quote !== null && limit !== null ? (
        <p className={gap <= 0 ? "font-medium text-emerald-800" : "font-medium text-rose-700"}>
          {gap === 0
            ? `O orçamento de ${formatMoney(quote)} é exatamente o limite.`
            : gap < 0
              ? `O orçamento de ${formatMoney(quote)} cabe: sobra ${formatMoney(-gap)} até o limite.`
              : `O orçamento de ${formatMoney(quote)} passa ${formatMoney(gap)} do limite: negocie até ${formatMoney(limit)}.`}
        </p>
      ) : null}
      {adsBasis === "today" && inputs.adsMetricsAvailable && inputs.tacosPercent !== null ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Com o TACOS de hoje ({formatPercent(inputs.tacosPercent)}). Para compra, o de 7 dias é
          mais estável:{" "}
          <button type="button" onClick={onUse7d} className={linkClass}>
            usar 7 dias
          </button>
        </p>
      ) : null}
      {rebate !== null && limit !== null ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Inclui o desconto de tarifa de {formatMoney(rebate)} da última venda em promoção: sem
          ele, o limite cai.
        </p>
      ) : null}
    </div>
  );
}
