"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type Ref } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingTypeTag } from "@/components/rotina/ListingTypeTag";
import {
  CalculatorNowStrip,
  CalculatorNowStripSkeleton,
  taxSourceLabel,
} from "@/components/calculadora/CalculatorNowStrip";
import { CalculatorPurchaseControl } from "@/components/calculadora/CalculatorPurchaseControl";
import { CalculatorPurchaseLine } from "@/components/calculadora/CalculatorPurchaseLine";
import { CalculatorTargetControl } from "@/components/calculadora/CalculatorTargetControl";
import { RotinaPriceSimulator } from "@/components/rotina/RotinaPriceSimulator";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import { fetchCalculatorApi, type CalculatorApi } from "@/lib/calculadora/calculator-api";
import type { CalculatorListing } from "@/lib/calculadora/calculator-listings";
import { effectiveCostFromNf } from "@/lib/calculadora/purchase-cost";
import {
  inputsWithAds,
  type CalculatorAds,
  type CalculatorReading,
  type TacosBasis,
} from "@/lib/calculadora/reading";
import { formatMoney, formatWhen } from "@/lib/rotina/format";
import {
  PROMO_DISCOUNT_SHORTCUTS,
  buildSimulatorSuggestions,
} from "@/lib/rotina/simulator-suggestions";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils";

type ReadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "done";
      reading: CalculatorReading;
      /** "Ler de novo" em andamento: a leitura anterior fica na tela. */
      refreshing: boolean;
      refreshError: string | null;
    };

type Ads7dState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; ads: CalculatorAds };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Atalhos de preço de um anúncio lido: ganhar o catálogo, o preço de agora e descontos. */
function suggestionsFor(reading: CalculatorReading, catalogListing: boolean) {
  const contested =
    reading.catalog?.status === "losing" || reading.catalog?.status === "shared";
  return buildSimulatorSuggestions({
    priceToWin: contested ? (reading.catalog?.priceToWin ?? null) : null,
    suggestedPrice: null,
    // Sem mínimo pronto: ele sai sob demanda. A base do desconto é o preço sem promoção.
    floor: { effectivePrice: null, discountBase: reading.regularPrice ?? reading.price },
    salePrice: reading.price,
    discounts: catalogListing ? undefined : PROMO_DISCOUNT_SHORTCUTS,
    raise: null,
  }).map((suggestion) =>
    suggestion.label === "Preço de hoje" ? { ...suggestion, label: "Preço de agora" } : suggestion,
  );
}

/**
 * A calculadora de um anúncio: cabeçalho, faixa "Agora" e o simulador. Ao
 * abrir, lê o anúncio no ML (preço, taxa e frete, custo, imposto e TACOS de
 * hoje) — uma vez: o `<Activity>` guarda a leitura enquanto o anúncio fica
 * entre os recentes. O TACOS de 7 dias só é lido quando o usuário pede.
 *
 * "Custo do orçamento" troca o custo do cadastro na conta (margem e mínimo) e
 * cada preço simulado diz até quanto dá para pagar na compra — sem cotar de
 * novo: a taxa e o frete não dependem do custo.
 */
export function CalculatorPanel({
  listing,
  timeZone,
  basis,
  onBasisChange,
  priceInputRef,
  api = fetchCalculatorApi,
  demo = false,
  options,
  onSelectOption,
}: {
  listing: CalculatorListing;
  timeZone: string;
  /** Base do TACOS escolhida na página (vale para todos os anúncios abertos). */
  basis: TacosBasis;
  onBasisChange: (basis: TacosBasis) => void;
  priceInputRef?: Ref<HTMLInputElement>;
  /** Leitura e simulações locais (demonstração da landing); padrão: as rotas. */
  api?: CalculatorApi;
  /** Demonstração: sem link para o anúncio no ML e título como h3 (a seção já tem h2). */
  demo?: boolean;
  /**
   * Opções de venda do produto (Clássico, Premium…), quando há mais de uma:
   * o cabeçalho troca entre elas sem voltar à lista. Cada uma tem a própria
   * calculadora (preço, tarifa e margem do anúncio).
   */
  options?: CalculatorListing[];
  onSelectOption?: (mlItemId: string) => void;
}) {
  const optionTabsId = useId();
  const { mlItemId } = listing;
  const [state, setState] = useState<ReadState>({ status: "loading" });
  const [ads7d, setAds7d] = useState<Ads7dState | null>(null);
  /** Margem mínima escolhida na tela; `null` = a meta que vale. */
  const [chosenTarget, setChosenTarget] = useState<number | null>(null);
  /** O orçamento digitado (NF por unidade, ou custo da conta); `null` = o cadastro. */
  const [quote, setQuote] = useState<number | null>(null);
  // O <Activity> refaz os efeitos ao reaparecer: as leituras só rodam uma vez.
  const readStarted = useRef(false);
  const ads7dStarted = useRef(false);

  // O estado só muda na resposta (`.then`), nunca na hora: dá para disparar de um efeito.
  const read = useCallback(() => {
    api.read(mlItemId).then(
      (reading) => setState({ status: "done", reading, refreshing: false, refreshError: null }),
      (e: unknown) => {
        const message = errorMessage(e, "Não foi possível ler o anúncio agora.");
        setState((current) =>
          current.status === "done"
            ? { ...current, refreshing: false, refreshError: message }
            : { status: "error", message },
        );
      },
    );
  }, [api, mlItemId]);

  const readAds7d = useCallback(() => {
    api.ads7d(mlItemId).then(
      (ads) => setAds7d({ status: "done", ads }),
      (e: unknown) =>
        setAds7d({
          status: "error",
          message: errorMessage(e, "Não foi possível ler o TACOS de 7 dias agora."),
        }),
    );
  }, [api, mlItemId]);

  useEffect(() => {
    if (readStarted.current) return;
    readStarted.current = true;
    read();
  }, [read]);

  // "7 dias" escolhido (aqui ou em outro anúncio aberto): lê uma vez.
  useEffect(() => {
    if (basis !== "7d" || ads7dStarted.current) return;
    ads7dStarted.current = true;
    readAds7d();
  }, [basis, readAds7d]);

  function retryRead() {
    setState({ status: "loading" });
    read();
  }

  function refresh() {
    setState((current) =>
      current.status === "done"
        ? { ...current, refreshing: true, refreshError: null }
        : { status: "loading" },
    );
    read();
    if (basis === "7d") {
      setAds7d({ status: "loading" });
      readAds7d();
    } else {
      // A próxima troca para 7 dias lê de novo, casando com a leitura nova.
      setAds7d(null);
      ads7dStarted.current = false;
    }
  }

  function retryAds7d() {
    setAds7d({ status: "loading" });
    readAds7d();
  }

  const reading = state.status === "done" ? state.reading : null;
  const ready7d = ads7d?.status === "done" ? ads7d.ads : null;
  // A conta só troca para 7 dias quando ele chega: o rótulo sempre casa com o número.
  const ads: CalculatorAds | null = reading
    ? basis === "7d" && ready7d
      ? ready7d
      : reading.ads
    : null;
  const loading7d = basis === "7d" && (ads7d === null || ads7d.status === "loading");
  const error7d = basis === "7d" && ads7d?.status === "error" ? ads7d.message : null;
  const targetPercent = chosenTarget ?? reading?.targetPercent ?? 0;
  const purchaseBasis = reading?.purchaseBasis ?? null;
  /** O orçamento como custo da conta (com IPI/ST e unidades do cadastro). */
  const quoteCost =
    quote === null || !purchaseBasis
      ? null
      : purchaseBasis.kind === "nf"
        ? effectiveCostFromNf(quote, purchaseBasis)
        : quote;
  // As simulações e o mínimo vão com o custo do orçamento no lugar do cadastro.
  const effectiveReading = useMemo(
    () =>
      reading && quoteCost !== null
        ? { ...reading, inputs: { ...reading.inputs, productCost: quoteCost } }
        : reading,
    [reading, quoteCost],
  );

  const simulatorApi = useMemo(
    () => (effectiveReading && ads ? api.simulatorFor(effectiveReading, ads) : null),
    [api, effectiveReading, ads],
  );
  const purchaseInputs = useMemo(
    () => (reading && ads ? inputsWithAds(reading.inputs, ads) : null),
    [reading, ads],
  );
  const suggestions = useMemo(
    () => (reading ? suggestionsFor(reading, listing.catalogListing) : []),
    [reading, listing.catalogListing],
  );

  const paused = listing.mlStatus !== null && listing.mlStatus !== "active";
  const hasOptionTabs = Boolean(options && options.length > 1 && onSelectOption);
  const Heading = demo ? "h3" : "h2";
  const taxLabel = reading ? taxSourceLabel(reading) : null;

  return (
    <article
      aria-label={`Calculadora: ${listing.title}`}
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm"
    >
      <header
        className={cn(
          "grid items-start gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5",
          // Com opções de venda: no celular, as abas descem para uma linha
          // própria (com o "Ver no ML" à direita); da tela média para cima,
          // ficam no canto direito, sob o "Ver no ML".
          hasOptionTabs
            ? "grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto]"
            : "grid-cols-[auto_minmax(0,1fr)_auto]",
        )}
      >
        <RotinaThumb src={listing.imageUrl} size={48} className="size-12" />
        <div className="min-w-0">
          <Heading className="line-clamp-2 text-base font-semibold leading-snug text-[var(--foreground)]">
            {listing.title}
          </Heading>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <SegmentTag segment={listing.catalogListing ? "catalog" : "own"} />
            <ListingTypeTag listingTypeId={reading?.listingTypeId ?? null} />
            <span className="tabular-nums">
              {listing.sku ? `${listing.sku} · ` : ""}
              {mlItemId}
              {paused ? " · pausado" : ""}
            </span>
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2",
            hasOptionTabs &&
              "col-span-2 justify-between sm:col-span-1 sm:flex-col-reverse sm:items-end sm:justify-start",
          )}
        >
          {hasOptionTabs && options && onSelectOption ? (
            <SegmentedTabs<string>
              baseId={optionTabsId}
              ariaLabel="Opção de venda do produto"
              value={mlItemId}
              onValueChange={(next) => {
                if (next !== mlItemId) onSelectOption(next);
              }}
              tabs={options.map((option) => ({
                id: option.mlItemId,
                label: option.saleOption?.label ?? option.mlItemId,
                badge: option.mlStatus && option.mlStatus !== "active" ? "pausado" : undefined,
              }))}
            />
          ) : null}
          {demo ? null : (
            <a
              href={listing.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Ver no ML
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </header>

      {state.status === "loading" ? <CalculatorNowStripSkeleton /> : null}

      {state.status === "error" ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-xs sm:px-5">
          <span className="text-rose-700">{state.message}</span>
          <Button type="button" size="sm" variant="outline" onClick={retryRead}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {state.status === "done" && reading && ads ? (
        <CalculatorNowStrip
          reading={reading}
          ads={ads}
          basis={basis}
          loading7d={loading7d}
          error7d={error7d}
          onBasisChange={onBasisChange}
          onRetry7d={retryAds7d}
          targetPercent={targetPercent}
          timeZone={timeZone}
          refreshing={state.refreshing}
          refreshError={state.refreshError}
          onRefresh={refresh}
        />
      ) : null}

      {reading && ads && simulatorApi && purchaseInputs && !reading.blocked ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <RotinaPriceSimulator
            mlItemId={mlItemId}
            listingTypeId={reading.listingTypeId}
            suggestions={suggestions}
            defaultPrice={reading.price > 0 ? reading.price : null}
            timeZone={timeZone}
            autoRun={false}
            priceInputRef={priceInputRef}
            api={simulatorApi}
            target={{ percent: targetPercent, saved: reading.targetPercent }}
            adsOverride={ads}
            costOverride={quoteCost ?? reading.inputs.productCost}
            floorScope={`${ads.basis}|${reading.readAt}|${quoteCost ?? "cadastro"}`}
            refreshFloor={false}
            inputsNote={
              <>
                {quoteCost !== null
                  ? `Custo do orçamento (${formatMoney(quoteCost)} na conta); imposto`
                  : "Custo, imposto"}
                {taxLabel ? ` (${taxLabel})` : ""} e ADS (TACOS{" "}
                {ads.basis === "today" ? "de hoje" : "de 7 dias"}) lidos{" "}
                {formatWhen(reading.readAt, new Date(), timeZone)}.
              </>
            }
            controls={
              <div className="grid gap-2 lg:grid-cols-2">
                <CalculatorTargetControl
                  value={targetPercent}
                  saved={reading.targetPercent}
                  ownTarget={reading.ownTarget}
                  onChange={setChosenTarget}
                />
                <CalculatorPurchaseControl
                  basis={reading.purchaseBasis}
                  cadastroCost={reading.inputs.productCost}
                  onChange={setQuote}
                />
              </div>
            }
            resultExtra={(result, place) => (
              <CalculatorPurchaseLine
                result={result}
                place={place}
                inputs={purchaseInputs}
                targetPercent={targetPercent}
                basis={reading.purchaseBasis}
                cadastroCost={reading.inputs.productCost}
                quote={quote}
                adsBasis={ads.basis}
                onUse7d={() => onBasisChange("7d")}
              />
            )}
          />
        </div>
      ) : null}
    </article>
  );
}
