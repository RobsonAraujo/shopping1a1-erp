"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Calculator, Check, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { SegmentedTabs, tabId, tabPanelId } from "@/components/ui/segmented-tabs";
import { ListingTypeTag, listingTypeShortLabel } from "@/components/rotina/ListingTypeTag";
import { readApiError } from "@/lib/api/api-client-error";
import { formatMoney, formatPercent, formatWhen } from "@/lib/rotina/format";
import type { RotinaFloorView } from "@/lib/rotina/floor-view";
import type { RotinaSimulation, RotinaTypeFloor } from "@/lib/rotina/simulate";
import type { SimulatedPrice } from "@/lib/rotina/simulate-margin";
import { STATUS_PILL_CLASS, valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

/** `kind: "floor"` = o mínimo da rodada, que só vale no tipo de hoje. */
export type SimulatorSuggestion = { label: string; price: number; kind?: "floor" };

type ListingTypeOption = "gold_special" | "gold_pro";

function isListingTypeOption(value: string | null | undefined): value is ListingTypeOption {
  return value === "gold_special" || value === "gold_pro";
}

const LISTING_TYPE_OPTIONS: ListingTypeOption[] = ["gold_special", "gold_pro"];

/** "no Clássico" / "no Premium". */
function inType(listingTypeId: string | null): string {
  const label = listingTypeShortLabel(listingTypeId);
  return label ? `no ${label}` : "";
}

type TypeFloorState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: RotinaTypeFloor };

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
  const push = (label: string, price: number | null | undefined, kind?: "floor") => {
    if (price === null || price === undefined || price <= 0) return;
    const rounded = Math.round(price * 100) / 100;
    if (list.some((entry) => Math.abs(entry.price - rounded) < 0.005)) return;
    list.push(kind ? { label, price: rounded, kind } : { label, price: rounded });
  };
  push("Ganhar sozinho (estim.)", args.raise?.winCeiling);
  push("Dividir (estim.)", args.raise?.shareCeiling);
  push("Preço p/ ganhar", args.priceToWin);
  push("Abaixo da faixa", args.suggestedPrice);
  push("Mínimo", args.floor?.effectivePrice, "floor");
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

/** Por que não saiu um mínimo no outro tipo. */
function typeFloorNote(state: TypeFloorState | undefined, label: string): string | null {
  if (!state || state.status === "loading") return null;
  if (state.status === "error") return state.message;
  const { result } = state;
  if (result.blocked) return null;
  if (!result.floor) return `O Mercado Livre não cotou a taxa ${label} no preço de hoje.`;
  if (result.floor.effectivePrice !== null) return null;
  switch (result.floor.reason) {
    case "impossible":
      return `${label[0].toUpperCase()}${label.slice(1)}, nenhum preço fecha a margem mínima.`;
    case "missing_product_cost":
      return "Sem custo cadastrado: não dá para calcular o mínimo.";
    default:
      return `Não foi possível calcular o mínimo ${label}.`;
  }
}

/**
 * "E se eu vender a R$ X?" — margem MC e após ADS no preço que o usuário quiser,
 * com a mesma conta da Lucratividade e do preço mínimo. Taxa e frete são cotados
 * no ML a cada preço; custo, imposto e ADS vêm da última atualização. Os preços
 * já testados ficam empilhados para comparar.
 *
 * Também simula o outro tipo (Clássico ↔ Premium): só a taxa muda, e o "Mínimo"
 * da rodada vira o mínimo calculado para o outro tipo.
 */
export function RotinaPriceSimulator({
  mlItemId,
  listingTypeId = null,
  suggestions,
  defaultPrice,
  timeZone,
  autoRun = true,
}: {
  mlItemId: string;
  /** Tipo de hoje pelo retrato; a resposta do simulador (item ao vivo) prevalece. */
  listingTypeId?: string | null;
  suggestions: SimulatorSuggestion[];
  defaultPrice: number | null;
  timeZone: string;
  autoRun?: boolean;
}) {
  const baseId = useId();
  const [input, setInput] = useState(defaultPrice !== null ? inputValue(defaultPrice) : "");
  const [results, setResults] = useState<SimulatedPrice[]>([]);
  const [meta, setMeta] = useState<Omit<RotinaSimulation, "results"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBreakdown, setOpenBreakdown] = useState<string | null>(null);
  /** `null` = o tipo de hoje. */
  const [selectedType, setSelectedType] = useState<ListingTypeOption | null>(null);
  const [typeFloors, setTypeFloors] = useState<Partial<Record<ListingTypeOption, TypeFloorState>>>(
    {},
  );
  const ranDefault = useRef(false);

  const currentType = meta?.currentListingTypeId ?? listingTypeId;
  const canSwitchType = isListingTypeOption(currentType);
  const activeType: string | null = selectedType ?? currentType;
  const otherType = canSwitchType && activeType !== currentType;
  /** O tipo a mandar ao servidor (`null` = o de hoje). */
  const runType: ListingTypeOption | null = otherType ? selectedType : null;

  const simulate = useCallback(
    async (price: number, type: ListingTypeOption | null) => {
      const wanted = type ?? currentType;
      const sameEntry = (result: SimulatedPrice) =>
        Math.abs(result.price - price) < 0.005 &&
        (wanted === null || result.listingTypeId === wanted);
      // Já simulado: só traz para o topo, sem nova consulta ao ML.
      const existing = results.find(sameEntry);
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
          body: JSON.stringify({
            mlItemId,
            prices: [price],
            ...(type ? { listingTypeId: type } : {}),
          }),
        });
        if (!response.ok) {
          throw new Error(await readApiError(response, "rotina_simulate_failed"));
        }
        const simulation = (await response.json()) as RotinaSimulation;
        const { results: fresh, ...rest } = simulation;
        setMeta(rest);
        const first = fresh[0];
        if (first) {
          setResults((current) => [
            first,
            ...current.filter(
              (result) =>
                Math.abs(result.price - first.price) >= 0.005 ||
                result.listingTypeId !== first.listingTypeId,
            ),
          ].slice(0, 6));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível simular agora.");
      } finally {
        setLoading(false);
      }
    },
    [mlItemId, results, currentType],
  );

  const loadTypeFloor = useCallback(
    async (type: ListingTypeOption) => {
      setTypeFloors((current) => ({ ...current, [type]: { status: "loading" } }));
      try {
        const response = await fetch("/api/rotina/simulate/floor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mlItemId, listingTypeId: type }),
        });
        if (!response.ok) {
          throw new Error(await readApiError(response, "rotina_simulate_floor_failed"));
        }
        const result = (await response.json()) as RotinaTypeFloor;
        setTypeFloors((current) => ({ ...current, [type]: { status: "done", result } }));
      } catch (e) {
        setTypeFloors((current) => ({
          ...current,
          [type]: {
            status: "error",
            message:
              e instanceof Error ? e.message : "Não foi possível calcular o mínimo agora.",
          },
        }));
      }
    },
    [mlItemId],
  );

  useEffect(() => {
    if (!autoRun || ranDefault.current || defaultPrice === null) return;
    ranDefault.current = true;
    void simulate(defaultPrice, null);
  }, [autoRun, defaultPrice, simulate]);

  /** Troca o tipo; refaz o preço do campo nele e pede o mínimo uma vez por tipo. */
  function selectType(type: ListingTypeOption, priceToRun: number | null) {
    setSelectedType(type === currentType ? null : type);
    // Uma vez por tipo; depois de um erro, trocar de novo tenta outra vez.
    const floorState = typeFloors[type];
    if (type !== currentType && (!floorState || floorState.status === "error")) {
      void loadTypeFloor(type);
    }
    if (priceToRun !== null) void simulate(priceToRun, type === currentType ? null : type);
  }

  function submit() {
    const price = parseBrlInput(input);
    if (price === null) {
      setError("Digite um preço válido, ex.: 47,90.");
      return;
    }
    void simulate(price, runType);
  }

  const latest = results[0] ?? null;
  const previous = results.slice(1);
  const target = meta?.targetPercent ?? null;
  const mixedTypes = new Set(results.map((result) => result.listingTypeId)).size > 1;
  const resultKey = (result: SimulatedPrice) => `${result.listingTypeId ?? ""}:${result.price}`;

  const activeLabel = inType(activeType);
  const floorState = otherType && selectedType ? typeFloors[selectedType] : undefined;
  const typeFloorPrice =
    floorState?.status === "done" ? (floorState.result.floor?.effectivePrice ?? null) : null;
  const floorNote = otherType ? typeFloorNote(floorState, activeLabel) : null;
  // No outro tipo o "Mínimo" da rodada não vale: entra o calculado para ele.
  const shownSuggestions = otherType
    ? suggestions.filter((suggestion) => suggestion.kind !== "floor")
    : suggestions;
  const chipClass =
    "cursor-pointer rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

  const panelId = tabPanelId(baseId, activeType ?? "atual");

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
          <Calculator className="size-3.5" aria-hidden />
          Simular preço
        </p>
        {canSwitchType ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
              Tipo do anúncio
            </span>
            <SegmentedTabs<ListingTypeOption>
              baseId={baseId}
              ariaLabel="Tipo do anúncio na simulação"
              value={selectedType ?? (currentType as ListingTypeOption)}
              onValueChange={(type) => {
                if (loading || type === activeType) return;
                selectType(type, parseBrlInput(input));
              }}
              tabs={LISTING_TYPE_OPTIONS.map((type) => ({
                id: type,
                label: listingTypeShortLabel(type) ?? type,
                badge: type === currentType ? "atual" : undefined,
              }))}
            />
          </div>
        ) : null}
      </div>

      <div
        id={canSwitchType ? panelId : undefined}
        role={canSwitchType ? "tabpanel" : undefined}
        aria-labelledby={canSwitchType && activeType ? tabId(baseId, activeType) : undefined}
        className="space-y-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <FormInput
              label={otherType ? `Se eu vender ${activeLabel} a (R$)` : "Se eu vender a (R$)"}
              inputMode="decimal"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="w-44"
              inputClassName="tabular-nums"
            />
            <Button type="submit" size="sm" disabled={loading} className="sm:h-10">
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Simular
            </Button>
          </form>

          {shownSuggestions.length > 0 || otherType ? (
            <div className="flex flex-wrap gap-1.5 sm:pb-0.5" aria-label="Atalhos de preço">
              {otherType && floorState?.status === "loading" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Calculando o mínimo {activeLabel}…
                </span>
              ) : null}
              {otherType && typeFloorPrice !== null ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setInput(inputValue(typeFloorPrice));
                    void simulate(typeFloorPrice, runType);
                  }}
                  className={chipClass}
                >
                  Mínimo {activeLabel}{" "}
                  <span className="tabular-nums text-[var(--muted-foreground)]">
                    {formatMoney(typeFloorPrice)}
                  </span>
                </button>
              ) : null}
              {shownSuggestions.map((suggestion) => (
                <button
                  key={`${suggestion.label}-${suggestion.price}`}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setInput(inputValue(suggestion.price));
                    void simulate(suggestion.price, runType);
                  }}
                  className={chipClass}
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

        {floorNote ? (
          <p className="text-xs text-[var(--muted-foreground)]">{floorNote}</p>
        ) : null}
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
              <span className="text-base font-semibold tabular-nums text-[var(--foreground)] sm:pb-3">
                A {formatMoney(latest.price)}
                {canSwitchType && latest.listingTypeId && latest.listingTypeId !== currentType
                  ? ` ${inType(latest.listingTypeId)}`
                  : ""}
                :
              </span>
              <ResultSummary result={latest} targetPercent={target} emphasis />
            </div>
            {latest.quoted ? (
              <button
                type="button"
                onClick={() =>
                  setOpenBreakdown((current) =>
                    current === resultKey(latest) ? null : resultKey(latest),
                  )
                }
                className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded text-xs font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                aria-expanded={openBreakdown === resultKey(latest)}
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform",
                    openBreakdown === resultKey(latest) && "rotate-90",
                  )}
                  aria-hidden
                />
                Ver a conta
              </button>
            ) : null}
            {openBreakdown === resultKey(latest) ? <Breakdown result={latest} /> : null}
          </div>
        ) : null}

        {previous.length > 0 && target !== null ? (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Comparar
            </p>
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
              {previous.map((result) => (
                <li key={resultKey(result)}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setInput(inputValue(result.price));
                      if (
                        canSwitchType &&
                        isListingTypeOption(result.listingTypeId) &&
                        result.listingTypeId !== activeType
                      ) {
                        selectType(result.listingTypeId, result.price);
                      } else {
                        void simulate(result.price, runType);
                      }
                    }}
                    className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-1.5 text-left text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/40 focus-visible:bg-[var(--muted)]/40 focus-visible:outline-none disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex w-20 items-center gap-1.5 font-semibold tabular-nums text-[var(--foreground)]">
                      {formatMoney(result.price)}
                    </span>
                    {mixedTypes ? <ListingTypeTag listingTypeId={result.listingTypeId} /> : null}
                    <ResultSummary result={result} targetPercent={target} emphasis={false} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {meta ? (
        <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          {otherType
            ? `${activeLabel[0].toUpperCase()}${activeLabel.slice(1)} só muda a taxa do Mercado Livre: frete, custo, imposto, ADS e meta são os de hoje. `
            : ""}
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
