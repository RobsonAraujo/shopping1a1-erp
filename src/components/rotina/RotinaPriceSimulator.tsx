"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Calculator, Check, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { SegmentedTabs, tabId, tabPanelId } from "@/components/ui/segmented-tabs";
import { ListingTypeTag, listingTypeShortLabel } from "@/components/rotina/ListingTypeTag";
import { formatMoney, formatPercent, formatWhen } from "@/lib/rotina/format";
import type { RotinaSimulation, RotinaTypeFloor } from "@/lib/rotina/simulate";
import type { SimulatedPrice } from "@/lib/rotina/simulate-margin";
import { fetchSimulatorApi, type SimulatorApi } from "@/lib/rotina/simulator-api";
import type { SimulatorSuggestion } from "@/lib/rotina/simulator-suggestions";
import { STATUS_PILL_CLASS, valueToneClass } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

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
 * Margem mínima na simulação. Na Central é a meta efetiva (vem do servidor);
 * na Calculadora o usuário mexe à vontade para testar.
 */
export type SimulatorTarget = {
  /** A margem mínima que o usuário quer testar agora. */
  percent: number;
  /** A meta efetiva (do anúncio ou do segmento): o "Mínimo" da rodada vale para ela. */
  saved: number;
};

function sameTarget(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/** O veredito contra outra meta: a conta de margem não muda, só "dentro/abaixo". */
export function withTarget(result: SimulatedPrice, percent: number): SimulatedPrice {
  if (!result.quoted) return result;
  const deciding =
    result.decidingBasis === "afterAds" ? result.marginAfterAdsPercent : result.marginPercent;
  return { ...result, meetsTarget: deciding === null ? null : deciding >= percent - 1e-9 };
}

/**
 * `null` = o tipo de hoje; `percent: null` = a meta efetiva; `scope` separa
 * mínimos feitos com insumos diferentes (Calculadora: TACOS de hoje ou 7 dias).
 */
function floorKey(
  type: ListingTypeOption | null,
  percent: number | null,
  scope: string | undefined,
): string {
  return `${type ?? "atual"}|${percent ?? "meta"}|${scope ?? ""}`;
}

/** Por que não saiu o mínimo pedido (outro tipo e/ou outra margem). */
function floorNoteFor(
  state: TypeFloorState | undefined,
  typeLabel: string,
  percent: number | null,
): string | null {
  if (!state || state.status === "loading") return null;
  if (state.status === "error") return state.message;
  const { result } = state;
  if (result.blocked) return null;
  if (!result.floor) {
    return typeLabel
      ? `O Mercado Livre não cotou a taxa ${typeLabel} no preço de hoje.`
      : "O Mercado Livre não cotou taxa e frete no preço de hoje.";
  }
  if (result.floor.effectivePrice !== null) return null;
  switch (result.floor.reason) {
    case "impossible":
      return `Nenhum preço${typeLabel ? ` ${typeLabel}` : ""} fecha a margem${
        percent !== null ? ` de ${formatPercent(percent)}` : " mínima"
      }.`;
    case "missing_product_cost":
      return "Sem custo cadastrado: não dá para calcular o mínimo.";
    default:
      return `Não foi possível calcular o mínimo${typeLabel ? ` ${typeLabel}` : ""}.`;
  }
}

/**
 * "E se eu vender a R$ X?" — margem MC e após ADS no preço que o usuário quiser,
 * com a mesma conta da Lucratividade e do preço mínimo. Taxa e frete são cotados
 * no ML a cada preço; custo, imposto e ADS vêm da última atualização. Os preços
 * já testados ficam empilhados para comparar.
 *
 * Também simula o outro tipo (Clássico ↔ Premium): só a taxa muda, e o "Mínimo"
 * da rodada vira o mínimo calculado para o outro tipo. Com `target` (Calculadora),
 * a margem mínima é a que o usuário escolhe: o veredito muda na hora, sem
 * cotação, e o mínimo para ela sai sob demanda ("Calcular mínimo p/ X%").
 *
 * Na Calculadora os insumos são da leitura ao vivo, não da rodada: sem "Mínimo"
 * pronto (`refreshFloor={false}`), e `rescore` refaz os preços já cotados quando
 * a base do TACOS muda (hoje ↔ 7 dias), sem nova cotação.
 */
export function RotinaPriceSimulator({
  mlItemId,
  listingTypeId = null,
  suggestions,
  defaultPrice,
  timeZone,
  autoRun = true,
  priceInputRef,
  api = fetchSimulatorApi,
  target = null,
  controls,
  rescore,
  floorScope,
  refreshFloor = true,
  inputsNote,
}: {
  mlItemId: string;
  /** Tipo de hoje pelo retrato; a resposta do simulador (item ao vivo) prevalece. */
  listingTypeId?: string | null;
  suggestions: SimulatorSuggestion[];
  /**
   * Preço que o campo já traz. `null` (anúncio sem leitura) = campo vazio e o
   * botão "Calcular no preço de hoje", que o servidor resolve.
   */
  defaultPrice: number | null;
  timeZone: string;
  /** `false` = só simula quando o usuário pede (Calculadora: zero cotação ao navegar). */
  autoRun?: boolean;
  /** Para quem usa levar o foco ao campo de preço (Calculadora, depois do Enter na lista). */
  priceInputRef?: Ref<HTMLInputElement>;
  /** De onde vêm as simulações: as rotas (padrão) ou a demonstração da landing. */
  api?: SimulatorApi;
  /** Margem mínima escolhida pelo usuário (Calculadora). `null` = a meta efetiva. */
  target?: SimulatorTarget | null;
  /** Controles extras sob o cabeçalho (Calculadora: a margem mínima que aceito). */
  controls?: ReactNode;
  /**
   * Refaz um preço já cotado com os insumos de agora (Calculadora: outra base
   * do TACOS). Taxa e frete ficam os cotados; nada vai ao ML.
   */
  rescore?: (result: SimulatedPrice) => SimulatedPrice;
  /** Separa os mínimos calculados com insumos diferentes (ex.: base do TACOS). */
  floorScope?: string;
  /**
   * `true` (Central) = os atalhos trazem o "Mínimo" da rodada, que vale no tipo
   * de hoje e na meta salva. `false` (Calculadora) = não há mínimo pronto: ele
   * sai sempre sob demanda ("Calcular mínimo").
   */
  refreshFloor?: boolean;
  /** Nota sobre de onde vêm custo, imposto e ADS (substitui a da rodada). */
  inputsNote?: ReactNode;
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
  /** Mínimos calculados sob demanda, por tipo e margem (`floorKey`). */
  const [floors, setFloors] = useState<Record<string, TypeFloorState>>({});
  const ranDefault = useRef(false);

  const currentType = meta?.currentListingTypeId ?? listingTypeId;
  const canSwitchType = isListingTypeOption(currentType);
  const activeType: string | null = selectedType ?? currentType;
  const otherType = canSwitchType && activeType !== currentType;
  /** O tipo a mandar ao servidor (`null` = o de hoje). */
  const runType: ListingTypeOption | null = otherType ? selectedType : null;
  /** Margem escolhida diferente da meta: o "Mínimo" da rodada deixa de valer. */
  const targetDiffers = target !== null && !sameTarget(target.percent, target.saved);
  /** A margem a pedir no cálculo do mínimo (`null` = a meta efetiva). */
  const floorPercent = targetDiffers ? target.percent : null;

  /** `price: null` = o preço de hoje, resolvido no servidor (anúncio sem leitura). */
  const simulate = useCallback(
    async (price: number | null, type: ListingTypeOption | null) => {
      const wanted = type ?? currentType;
      const sameEntry = (result: SimulatedPrice) =>
        price !== null &&
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
        const simulation = await api.simulate({
          mlItemId,
          ...(price !== null ? { prices: [price] } : {}),
          ...(type ? { listingTypeId: type } : {}),
        });
        const { results: fresh, ...rest } = simulation;
        setMeta(rest);
        const first = fresh[0];
        if (first && price === null) setInput(inputValue(first.price));
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
    [api, mlItemId, results, currentType],
  );

  const loadFloor = useCallback(
    async (type: ListingTypeOption | null, percent: number | null) => {
      const key = floorKey(type, percent, floorScope);
      setFloors((current) => ({ ...current, [key]: { status: "loading" } }));
      try {
        const result = await api.floor({
          mlItemId,
          ...(type ? { listingTypeId: type } : {}),
          ...(percent !== null ? { targetPercent: percent } : {}),
        });
        setFloors((current) => ({ ...current, [key]: { status: "done", result } }));
      } catch (e) {
        setFloors((current) => ({
          ...current,
          [key]: {
            status: "error",
            message:
              e instanceof Error ? e.message : "Não foi possível calcular o mínimo agora.",
          },
        }));
      }
    },
    [api, mlItemId, floorScope],
  );

  useEffect(() => {
    if (!autoRun || ranDefault.current || defaultPrice === null) return;
    ranDefault.current = true;
    void simulate(defaultPrice, null);
  }, [autoRun, defaultPrice, simulate]);

  /** Troca o tipo; refaz o preço do campo nele e pede o mínimo do outro tipo uma vez. */
  function selectType(type: ListingTypeOption, priceToRun: number | null) {
    setSelectedType(type === currentType ? null : type);
    // Uma vez por tipo e margem; depois de um erro, trocar de novo tenta outra vez.
    if (type !== currentType) {
      const state = floors[floorKey(type, floorPercent, floorScope)];
      if (!state || state.status === "error") void loadFloor(type, floorPercent);
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

  const scoredResults = rescore ? results.map(rescore) : results;
  const shownResults = target
    ? scoredResults.map((result) => withTarget(result, target.percent))
    : scoredResults;
  const latest = shownResults[0] ?? null;
  const previous = shownResults.slice(1);
  const effectiveTarget = target?.percent ?? meta?.targetPercent ?? null;
  const mixedTypes = new Set(results.map((result) => result.listingTypeId)).size > 1;
  const resultKey = (result: SimulatedPrice) => `${result.listingTypeId ?? ""}:${result.price}`;

  const activeLabel = inType(activeType);
  // O "Mínimo" da rodada só vale no tipo de hoje e na meta efetiva; fora disso
  // entra o calculado para o tipo/margem da tela.
  const snapshotFloorValid = refreshFloor && !otherType && !targetDiffers;
  const floorState = snapshotFloorValid
    ? undefined
    : floors[floorKey(runType, floorPercent, floorScope)];
  const computedFloorPrice =
    floorState?.status === "done" ? (floorState.result.floor?.effectivePrice ?? null) : null;
  const floorSuffix = `${otherType ? ` ${activeLabel}` : ""}${
    targetDiffers ? ` p/ ${formatPercent(target.percent)}` : ""
  }`;
  const offerFloorButton =
    !snapshotFloorValid &&
    !meta?.blocked &&
    (!floorState || floorState.status === "error");
  const floorNote = snapshotFloorValid
    ? null
    : floorNoteFor(floorState, otherType ? activeLabel : "", floorPercent);
  // Sem mínimo da rodada (Calculadora): o calculado diz também o PMA e o desconto máximo.
  const computedFloor =
    !refreshFloor && !otherType && floorState?.status === "done" ? floorState.result.floor : null;
  const floorDetail =
    computedFloor && computedFloor.effectivePrice !== null
      ? [
          computedFloor.boundBy === "pma" ? "O mínimo é o PMA cadastrado" : null,
          computedFloor.maxDiscountPercent !== null && computedFloor.discountBase !== null
            ? `desconto máximo de promoção: ${computedFloor.maxDiscountPercent}% sobre ${formatMoney(computedFloor.discountBase)}`
            : null,
        ]
          .filter((part) => part !== null)
          .join(" · ")
      : "";
  const baseSuggestions = snapshotFloorValid
    ? suggestions
    : suggestions.filter((suggestion) => suggestion.kind !== "floor");
  // Anúncio sem leitura: o preço de hoje só chega com a primeira resposta.
  const todayPrice = meta?.salePrice ?? null;
  const shownSuggestions =
    todayPrice !== null &&
    !baseSuggestions.some((suggestion) => Math.abs(suggestion.price - todayPrice) < 0.005)
      ? [...baseSuggestions, { label: "Preço de hoje", price: todayPrice }]
      : baseSuggestions;
  const offerTodayPrice = defaultPrice === null && meta === null;
  const chipClass =
    "cursor-pointer rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
  const hasChips =
    shownSuggestions.length > 0 ||
    computedFloorPrice !== null ||
    floorState?.status === "loading" ||
    offerFloorButton;

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

      {controls}

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
              ref={priceInputRef}
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

          {offerTodayPrice ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void simulate(null, runType)}
              className="sm:h-10"
            >
              Calcular no preço de hoje
            </Button>
          ) : null}

          {hasChips ? (
            <div className="flex flex-wrap gap-1.5 sm:pb-0.5" aria-label="Atalhos de preço">
              {floorState?.status === "loading" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Calculando o mínimo{floorSuffix}…
                </span>
              ) : null}
              {offerFloorButton ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadFloor(runType, floorPercent)}
                  className={cn(chipClass, "border-dashed text-[var(--primary)]")}
                  title="Busca o menor preço que fecha essa margem (leva alguns segundos)"
                >
                  Calcular mínimo{floorSuffix}
                </button>
              ) : null}
              {computedFloorPrice !== null ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setInput(inputValue(computedFloorPrice));
                    void simulate(computedFloorPrice, runType);
                  }}
                  className={chipClass}
                >
                  Mínimo{floorSuffix}{" "}
                  <span className="tabular-nums text-[var(--muted-foreground)]">
                    {formatMoney(computedFloorPrice)}
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
        {floorDetail ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            {floorDetail[0].toUpperCase()}
            {floorDetail.slice(1)}.
          </p>
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

        {latest && effectiveTarget !== null ? (
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
              <ResultSummary result={latest} targetPercent={effectiveTarget} emphasis />
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

        {previous.length > 0 && effectiveTarget !== null ? (
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
                    <ResultSummary
                      result={result}
                      targetPercent={effectiveTarget}
                      emphasis={false}
                    />
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
            ? `${activeLabel[0].toUpperCase()}${activeLabel.slice(1)} só muda a taxa do Mercado Livre: frete, custo, imposto${
                target ? " e ADS são" : ", ADS e meta são"
              } os de hoje. `
            : ""}
          {meta.inputsFrom === "demo" ? (
            "Dados de exemplo: taxa e frete saem de uma tabela simples do Mercado Livre. Conectado, taxa e frete são cotados no Mercado Livre a cada preço, com o custo, o imposto e o ADS da sua loja."
          ) : (
            <>
              Taxa e frete cotados agora no Mercado Livre para cada preço.{" "}
              {inputsNote ?? (
                <>
                  Custo, imposto e ADS (TACOS de 7 dias){" "}
                  {meta.inputsFrom === "refresh" && meta.inputsAt
                    ? `da atualização de ${formatWhen(meta.inputsAt, new Date(), timeZone)}`
                    : "lidos agora (anúncio ainda sem atualização)"}
                  .
                </>
              )}
              {meta.feeRebate !== null
                ? ` Inclui o desconto de tarifa de ${formatMoney(meta.feeRebate)} da última venda em promoção.`
                : ""}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
