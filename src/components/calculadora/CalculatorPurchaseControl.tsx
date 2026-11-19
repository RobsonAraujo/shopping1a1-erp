"use client";

import { useId, useState } from "react";
import { FormInput } from "@/components/ui/form-input";
import { parseBrlInput } from "@/components/rotina/RotinaPriceSimulator";
import {
  effectiveCostFromNf,
  nfDiffersFromEffective,
  type CalculatorPurchaseBasis,
} from "@/lib/calculadora/purchase-cost";
import { formatMoney, formatPercent } from "@/lib/rotina/format";

/** "IPI 3,25%, ST estimada", "2 un, IPI 5%": o que leva o preço da NF ao custo da conta. */
export function nfRuleLabel(basis: CalculatorPurchaseBasis): string {
  if (basis.kind !== "nf") return "";
  return [
    basis.units !== 1 ? `${basis.units} un` : null,
    basis.ipiPercent > 0 ? `IPI ${formatPercent(basis.ipiPercent, 2)}` : null,
    basis.stFactor !== null ? "ST estimada pela proporção do cadastro" : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

/** O custo do cadastro na mesma unidade do campo: NF por unidade, ou o custo da conta. */
export function cadastroInQuoteUnits(
  basis: CalculatorPurchaseBasis,
  cadastroCost: number | null,
): number | null {
  return basis.kind === "nf" ? basis.unitCostNf : cadastroCost;
}

function differenceLabel(value: number, reference: number): string {
  const diff = Math.round((value - reference) * 100) / 100;
  if (Math.abs(diff) < 0.005) return "igual ao cadastro";
  return `${formatMoney(Math.abs(diff))} ${diff > 0 ? "acima" : "abaixo"} do cadastro`;
}

/**
 * "Custo do orçamento": o preço que o fornecedor passou, no lugar do custo do
 * cadastro, para ver a margem e o mínimo com ele. Em produto (ou kit de um
 * produto só) o campo é o preço unitário na NF; o IPI e a ST do cadastro levam
 * ao custo da conta. Kit de vários produtos: o custo do kit, já na conta.
 * Nada é gravado, e nada vai ao ML: os preços já cotados são refeitos.
 */
export function CalculatorPurchaseControl({
  basis,
  cadastroCost,
  onChange,
}: {
  basis: CalculatorPurchaseBasis;
  /** O custo do cadastro na conta (o do anúncio inteiro). */
  cadastroCost: number | null;
  /** O orçamento na unidade do campo; `null` = vazio (vale o cadastro). */
  onChange: (quote: number | null) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState("");
  const filled = draft.trim() !== "";
  const quote = filled ? parseBrlInput(draft) : null;
  const cadastro = cadastroInQuoteUnits(basis, cadastroCost);
  const converts = nfDiffersFromEffective(basis);

  function update(text: string) {
    setDraft(text);
    onChange(text.trim() ? parseBrlInput(text) : null);
  }

  const unitLabel =
    basis.kind === "nf"
      ? basis.units !== 1
        ? `por unidade, na NF (o kit leva ${basis.units})`
        : "por unidade, na NF"
      : basis.reason === "kit"
        ? "o kit inteiro, já com impostos de compra"
        : "custo do produto, já com impostos de compra";

  let hint: string;
  if (filled && quote === null) {
    hint = "Digite um valor, ex.: 41,90.";
  } else if (quote !== null) {
    const parts = [
      converts && basis.kind === "nf"
        ? `Na conta: ${formatMoney(effectiveCostFromNf(quote, basis))} (${nfRuleLabel(basis)})`
        : null,
      cadastro !== null ? differenceLabel(quote, cadastro) : null,
    ].filter((part) => part !== null);
    hint = `${parts.join(" · ")}. A margem e o mínimo abaixo usam este custo.`;
  } else {
    const reference =
      cadastro === null
        ? null
        : basis.kind === "nf"
          ? `${formatMoney(cadastro)}/un na NF${
              converts && cadastroCost !== null ? ` (${formatMoney(cadastroCost)} na conta)` : ""
            }`
          : formatMoney(cadastro);
    hint = `Vazio = o custo do cadastro${reference ? `: ${reference}` : ""}. Só para testar aqui: não muda o cadastro.`;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor={inputId} className="text-xs font-medium text-[var(--foreground)]">
          Custo do orçamento
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]"
            aria-hidden
          >
            R$
          </span>
          <FormInput
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            placeholder={cadastro !== null ? formatMoney(cadastro).replace(/^R\$\s?/, "") : ""}
            value={draft}
            aria-describedby={hintId}
            aria-invalid={filled && quote === null ? true : undefined}
            onChange={(event) => update(event.target.value)}
            className="w-28"
            inputClassName="h-8 pl-8 font-semibold tabular-nums sm:h-8"
          />
        </div>
        <span className="text-[11px] text-[var(--muted-foreground)]">{unitLabel}</span>
        {filled ? (
          <button
            type="button"
            onClick={() => update("")}
            className="cursor-pointer rounded text-[11px] font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            limpar
          </button>
        ) : null}
      </div>
      <p
        id={hintId}
        className={
          filled && quote === null
            ? "mt-1 text-[11px] leading-snug text-rose-700"
            : "mt-1 text-[11px] leading-snug text-[var(--muted-foreground)]"
        }
      >
        {hint}
      </p>
    </div>
  );
}
