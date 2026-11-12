"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, Check, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { readApiError } from "@/lib/api/api-client-error";
import { formatMoney, formatPercent, formatWhen } from "@/lib/rotina/format";
import type { RotinaFloorView } from "@/lib/rotina/floor-view";
import type { RotinaSimulation } from "@/lib/rotina/simulate";
import type { SimulatedPrice } from "@/lib/rotina/simulate-margin";
import { STATUS_PILL_CLASS, valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

export type SimulatorSuggestion = { label: string; price: number };

/** "47,34", "R$ 1.234,56", "47.34" → número. */
export function parseBrlInput(raw: string): number | null {
  let text = raw.replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

function inputValue(price: number): string {
  return price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Atalhos do simulador conforme o tipo de ação. */
export function buildSimulatorSuggestions(args: {
  priceToWin: number | null;
  suggestedPrice: number | null;
  floor: RotinaFloorView | null;
  salePrice: number | null;
  /** Atalhos de desconto (promoção): % sobre o preço original. */
  discounts?: number[];
  /** Subir preço no catálogo: as duas estimativas. */
  raise?: { winCeiling: number | null; shareCeiling: number | null } | null;
}): SimulatorSuggestion[] {
  const list: SimulatorSuggestion[] = [];
  const push = (label: string, price: number | null | undefined) => {
    if (price === null || price === undefined || price <= 0) return;
    const rounded = Math.round(price * 100) / 100;
    if (list.some((entry) => Math.abs(entry.price - rounded) < 0.005)) return;
    list.push({ label, price: rounded });
  };
  push("Ganhar sozinho (estim.)", args.raise?.winCeiling);
  push("Dividir (estim.)", args.raise?.shareCeiling);
  push("Preço p/ ganhar", args.priceToWin);
  push("Abaixo da faixa", args.suggestedPrice);
  push("Mínimo", args.floor?.effectivePrice);
  push("Preço de hoje", args.salePrice);
  const base = args.floor?.discountBase ?? null;
  if (base !== null) {
    for (const discount of args.discounts ?? []) {
      push(`−${discount}%`, base * (1 - discount / 100));
    }
  }
  return list;
}

function TargetStatus({
  meetsTarget,
  targetPercent,
  compact,
}: {
  meetsTarget: boolean;
  targetPercent: number;
  compact: boolean;
}) {
  const Icon = meetsTarget ? Check : X;
  const tone = STATUS_PILL_CLASS[meetsTarget ? "ok" : "danger"].wrap;
  const text = meetsTarget
    ? `dentro do mínimo de ${formatPercent(targetPercent)}`
    : `abaixo do mínimo de ${formatPercent(targetPercent)}`;
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium",
          meetsTarget ? "text-emerald-800" : "text-rose-800",
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {text}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tone,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

function ResultSummary({
  result,
  targetPercent,
  emphasis,
}: {
  result: SimulatedPrice;
  targetPercent: number;
  emphasis: boolean;
}) {
  if (!result.quoted) {
    return (
      <span className="text-xs text-[var(--muted-foreground)]">
        O Mercado Livre não cotou taxa e frete neste preço.
      </span>
    );
  }
  // A margem que decide é colorida pela META (dentro/abaixo do mínimo), não só
  // pelo sinal: 0,3% positivo mas abaixo de 2% não pode aparecer verde.
  const decidingTone =
    result.meetsTarget === null
      ? "text-[var(--foreground)]"
      : result.meetsTarget
        ? "text-emerald-800"
        : "text-rose-700";
  const otherTone = (value: number | null) =>
    value !== null && value < 0 ? "text-rose-800" : "text-[var(--foreground)]";
  const metrics = [
    result.decidingBasis === "afterAds"
      ? {
          key: "afterAds",
          label: "Após ADS",
          percent: result.marginAfterAdsPercent,
          value: result.marginAfterAdsValue,
          deciding: true,
        }
      : null,
    {
      key: "mc",
      label: "MC",
      percent: result.marginPercent,
      value: result.marginValue,
      deciding: result.decidingBasis === "contribution",
    },
  ].filter((metric) => metric !== null);

  if (!emphasis) {
    return (
      <>
        {metrics.map((metric) => (
          <span key={metric.key} className="tabular-nums">
            {metric.label}{" "}
            <strong
              className={cn(
                "font-semibold",
                metric.deciding ? decidingTone : otherTone(metric.percent),
              )}
            >
              {formatPercent(metric.percent)}
            </strong>
          </span>
        ))}
        {result.meetsTarget !== null ? (
          <TargetStatus meetsTarget={result.meetsTarget} targetPercent={targetPercent} compact />
        ) : null}
      </>
    );
  }

  return (
    <span className="flex flex-wrap items-end gap-x-6 gap-y-2">
      {metrics.map((metric) => (
        <span key={metric.key} className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {metric.label}
          </span>
          <strong
            className={cn(
              "block font-bold leading-tight tabular-nums",
              metric.deciding ? "text-xl" : "text-base",
              metric.deciding ? decidingTone : otherTone(metric.percent),
            )}
          >
            {formatPercent(metric.percent)}
          </strong>
          {metric.value !== null ? (
            <span className="block text-[11px] tabular-nums text-[var(--muted-foreground)]">
              {formatMoney(metric.value)}/venda
            </span>
          ) : null}
        </span>
      ))}
      {result.meetsTarget !== null ? (
        <span className="pb-0.5">
          <TargetStatus
            meetsTarget={result.meetsTarget}
            targetPercent={targetPercent}
            compact={false}
          />
        </span>
      ) : null}
    </span>
  );
}

function Breakdown({ result }: { result: SimulatedPrice }) {
  return (
    <table className="mt-2 w-full border-collapse text-xs">
      <tbody>
        {result.lines.map((line) => {
          const isResult = line.key === "margin" || line.key === "marginAfterAds";
          return (
            <tr
              key={line.key}
              className={cn(
                "border-b border-[var(--border)] last:border-0",
                isResult && "font-semibold",
                line.key === "mlFeeRebate" && "text-emerald-800",
              )}
            >
              <td className="py-1 pr-3">{line.label}</td>
              <td className={cn("py-1 pr-3 text-right tabular-nums", isResult && valueToneClass(line.value))}>
                {formatMoney(line.value)}
              </td>
              <td className="py-1 text-right tabular-nums text-[var(--muted-foreground)]">
                {formatPercent(line.percentOfSale)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * "E se eu vender a R$ X?" — margem MC e após ADS no preço que o usuário quiser,
 * com a mesma conta da Lucratividade e do preço mínimo. Taxa e frete são cotados
 * no ML a cada preço; custo, imposto e ADS vêm da última atualização. Os preços
 * já testados ficam empilhados para comparar.
 */
export function RotinaPriceSimulator({
  mlItemId,
  suggestions,
  defaultPrice,
  timeZone,
  autoRun = true,
}: {
  mlItemId: string;
  suggestions: SimulatorSuggestion[];
  defaultPrice: number | null;
  timeZone: string;
  autoRun?: boolean;
}) {
  const [input, setInput] = useState(defaultPrice !== null ? inputValue(defaultPrice) : "");
  const [results, setResults] = useState<SimulatedPrice[]>([]);
  const [meta, setMeta] = useState<Omit<RotinaSimulation, "results"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBreakdown, setOpenBreakdown] = useState<number | null>(null);
  const ranDefault = useRef(false);

  const simulate = useCallback(
    async (price: number) => {
      // Já simulado: só traz para o topo, sem nova consulta ao ML.
      const existing = results.find((result) => Math.abs(result.price - price) < 0.005);
      if (existing) {
        setResults((current) => [existing, ...current.filter((result) => result !== existing)]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/rotina/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mlItemId, prices: [price] }),
        });
        if (!response.ok) {
          throw new Error(await readApiError(response, "rotina_simulate_failed"));
        }
        const simulation = (await response.json()) as RotinaSimulation;
        const { results: fresh, ...rest } = simulation;
        setMeta(rest);
        if (fresh[0]) {
          setResults((current) => [
            fresh[0],
            ...current.filter((result) => Math.abs(result.price - fresh[0].price) >= 0.005),
          ].slice(0, 6));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível simular agora.");
      } finally {
        setLoading(false);
      }
    },
    [mlItemId, results],
  );

  useEffect(() => {
    if (!autoRun || ranDefault.current || defaultPrice === null) return;
    ranDefault.current = true;
    void simulate(defaultPrice);
  }, [autoRun, defaultPrice, simulate]);

  function submit() {
    const price = parseBrlInput(input);
    if (price === null) {
      setError("Digite um preço válido, ex.: 47,90.");
      return;
    }
    void simulate(price);
  }

  const latest = results[0] ?? null;
  const previous = results.slice(1);
  const target = meta?.targetPercent ?? null;

  return (
    <div className="space-y-3 pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
        <Calculator className="size-3.5" aria-hidden />
        Simular preço
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormInput
            label="Se eu vender a (R$)"
            inputMode="decimal"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="w-36"
            inputClassName="tabular-nums"
          />
          <Button type="submit" size="sm" disabled={loading} className="sm:h-10">
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Simular
          </Button>
        </form>

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 sm:pb-0.5" aria-label="Atalhos de preço">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.label}-${suggestion.price}`}
                type="button"
                disabled={loading}
                onClick={() => {
                  setInput(inputValue(suggestion.price));
                  void simulate(suggestion.price);
                }}
                className="cursor-pointer rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion.label}{" "}
                <span className="tabular-nums text-[var(--muted-foreground)]">
                  {formatMoney(suggestion.price)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}

      {meta?.blocked ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          {meta.blocked === "missing_cost"
            ? "Sem custo cadastrado: não dá para calcular a margem."
            : "Faltam dados (alíquota ou composição do kit) para calcular a margem."}{" "}
          <Link
            href="/dashboard/produtos"
            className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Completar em Meus produtos
          </Link>
        </p>
      ) : null}

      {latest && target !== null ? (
        <div
          className={cn(
            "rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-sm transition-opacity",
            loading && "opacity-60",
          )}
          aria-live="polite"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-6">
            <span className="text-base font-semibold tabular-nums text-[var(--foreground)] sm:pb-3">A {formatMoney(latest.price)}:</span>
            <ResultSummary result={latest} targetPercent={target} emphasis />
          </div>
          {latest.quoted ? (
            <button
              type="button"
              onClick={() =>
                setOpenBreakdown((current) => (current === latest.price ? null : latest.price))
              }
              className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded text-xs font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-expanded={openBreakdown === latest.price}
            >
              <ChevronRight
                className={cn("size-3.5 transition-transform", openBreakdown === latest.price && "rotate-90")}
                aria-hidden
              />
              Ver a conta
            </button>
          ) : null}
          {openBreakdown === latest.price ? <Breakdown result={latest} /> : null}
        </div>
      ) : null}

      {previous.length > 0 && target !== null ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Comparar
          </p>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
            {previous.map((result) => (
              <li key={result.price}>
                <button
                  type="button"
                  onClick={() => {
                    setInput(inputValue(result.price));
                    void simulate(result.price);
                  }}
                  className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-1.5 text-left text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/40 focus-visible:bg-[var(--muted)]/40 focus-visible:outline-none"
                >
                  <span className="w-20 font-semibold tabular-nums text-[var(--foreground)]">
                    {formatMoney(result.price)}
                  </span>
                  <ResultSummary result={result} targetPercent={target} emphasis={false} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {meta ? (
        <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          Taxa e frete cotados agora no Mercado Livre para cada preço. Custo, imposto e
          ADS (TACOS de 7 dias){" "}
          {meta.inputsFrom === "refresh" && meta.inputsAt
            ? `da atualização de ${formatWhen(meta.inputsAt, new Date(), timeZone)}`
            : "lidos agora (anúncio ainda sem atualização)"}
          .
          {meta.feeRebate !== null
            ? ` Inclui o desconto de tarifa de ${formatMoney(meta.feeRebate)} da última venda em promoção.`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
