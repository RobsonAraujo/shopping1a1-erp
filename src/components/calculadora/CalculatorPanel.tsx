"use client";

import Link from "next/link";
import { useState, type Ref } from "react";
import { ExternalLink, Info } from "lucide-react";
import { ListingTypeTag } from "@/components/rotina/ListingTypeTag";
import { CalculatorTargetControl } from "@/components/calculadora/CalculatorTargetControl";
import { RotinaPriceSimulator } from "@/components/rotina/RotinaPriceSimulator";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import type { CalculatorListing, CalculatorToday } from "@/lib/rotina/calculator-listings";
import { formatMoney, formatPercent } from "@/lib/rotina/format";
import type { SimulatorApi } from "@/lib/rotina/simulator-api";
import { STATUS_PILL_CLASS } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

const LINK_CLASS =
  "font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded";

function Stat({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string | null;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums text-[var(--foreground)]",
          valueClassName,
        )}
      >
        {value}
      </dd>
      {hint ? (
        <dd className="text-[11px] leading-snug text-[var(--muted-foreground)]">{hint}</dd>
      ) : null}
    </div>
  );
}

/**
 * Margem colorida como no simulador: a que decide pela margem escolhida
 * (dentro/abaixo), a outra só fica vermelha se negativa.
 */
function marginClass(
  today: CalculatorToday,
  basis: CalculatorToday["decidingBasis"],
  value: number | null,
  targetPercent: number,
) {
  if (value === null) return "text-[var(--muted-foreground)]";
  if (basis === today.decidingBasis) {
    return value >= targetPercent - 1e-9 ? "text-emerald-800" : "text-rose-700";
  }
  return value < 0 ? "text-rose-800" : undefined;
}

/** O mínimo da rodada vale para a meta da Central; com outra margem, diz isso. */
function floorHint(today: CalculatorToday, targetPercent: number): string | null {
  if (today.floorPrice === null) return null;
  const differs = Math.abs(targetPercent - today.targetPercent) > 1e-9;
  const parts = [
    `p/ ${formatPercent(today.targetPercent)}${differs ? ` (${today.ownTarget ? "meta própria" : "meta da Central"})` : ""}`,
  ];
  if (!differs && today.ownTarget) parts.push("meta própria");
  if (today.floorBoundByPma) parts.push("PMA");
  if (today.floorStale) parts.push("calculado com outra meta");
  return parts.join(" · ");
}

const CATALOG_STATUS_TEXT = {
  losing: { tone: "danger", label: "Perdendo o catálogo" },
  shared: { tone: "warning", label: "Dividindo o 1º lugar" },
  winning: { tone: "ok", label: "Ganhando o catálogo" },
} as const;

/** Faixa "Hoje": o retrato da última atualização — aparece sem chamar o ML. */
function TodayStrip({
  today,
  lastCompleteRunLabel,
  targetPercent,
}: {
  today: CalculatorToday;
  lastCompleteRunLabel: string | null;
  /** A margem mínima escolhida na tela (colore a margem que decide). */
  targetPercent: number;
}) {
  const catalog =
    today.catalogStatus && today.catalogStatus !== "unknown"
      ? CATALOG_STATUS_TEXT[today.catalogStatus]
      : null;
  return (
    <section
      aria-label="Hoje"
      className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold text-[var(--foreground)]">
          Hoje
          {lastCompleteRunLabel ? (
            <span className="font-normal text-[var(--muted-foreground)]">
              {" "}
              · atualização de {lastCompleteRunLabel}
            </span>
          ) : null}
        </p>
        {catalog ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              STATUS_PILL_CLASS[catalog.tone].wrap,
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", STATUS_PILL_CLASS[catalog.tone].dot)}
              aria-hidden
            />
            {catalog.label}
            {today.priceToWin !== null && today.catalogStatus !== "winning"
              ? ` · p/ ganhar ${formatMoney(today.priceToWin)}`
              : ""}
          </span>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
        <Stat
          label="Preço"
          value={formatMoney(today.price)}
          hint={today.hasPromotion ? "em promoção" : null}
        />
        <Stat
          label="MC"
          value={formatPercent(today.marginPercent)}
          valueClassName={marginClass(today, "contribution", today.marginPercent, targetPercent)}
        />
        <Stat
          label="Após ADS"
          value={formatPercent(today.marginAfterAdsPercent)}
          hint={today.marginAfterAdsPercent === null ? "sem ADS" : null}
          valueClassName={marginClass(
            today,
            "afterAds",
            today.marginAfterAdsPercent,
            targetPercent,
          )}
        />
        <Stat
          label="Mínimo"
          value={today.floorPrice !== null ? formatMoney(today.floorPrice) : "—"}
          hint={floorHint(today, targetPercent)}
        />
        <Stat
          label="Desc. máx."
          value={today.maxDiscountPercent !== null ? `${today.maxDiscountPercent}%` : "—"}
        />
      </dl>
      {today.exclusionLabel ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          {today.exclusionLabel}: a margem não sai.{" "}
          <Link href="/dashboard/produtos" className={LINK_CLASS}>
            Completar em Meus produtos
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/**
 * A calculadora de um anúncio: cabeçalho, faixa "Hoje" e o simulador da
 * Central. Nada aqui chama o ML ao abrir — só quando o usuário simula.
 */
export function CalculatorPanel({
  listing,
  timeZone,
  lastCompleteRunLabel,
  priceInputRef,
  api,
  demo = false,
}: {
  listing: CalculatorListing;
  timeZone: string;
  lastCompleteRunLabel: string | null;
  priceInputRef?: Ref<HTMLInputElement>;
  /** Simulações locais (demonstração da landing); padrão: as rotas do painel. */
  api?: SimulatorApi;
  /** Demonstração: sem link para o anúncio no ML e título como h3 (a seção já tem h2). */
  demo?: boolean;
}) {
  const paused = listing.mlStatus !== null && listing.mlStatus !== "active";
  // Cada calculadora guarda a sua margem enquanto fica viva (recentes).
  const [targetPercent, setTargetPercent] = useState(listing.targetPercent);
  const Heading = demo ? "h3" : "h2";
  return (
    <article
      aria-label={`Calculadora: ${listing.title}`}
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm"
    >
      <header className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <RotinaThumb src={listing.imageUrl} size={48} className="size-12" />
        <div className="min-w-0 flex-1">
          <Heading className="line-clamp-2 text-base font-semibold leading-snug text-[var(--foreground)]">
            {listing.title}
          </Heading>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <SegmentTag segment={listing.catalogListing ? "catalog" : "own"} />
            <ListingTypeTag listingTypeId={listing.listingTypeId} />
            <span className="tabular-nums">
              {listing.sku ? `${listing.sku} · ` : ""}
              {listing.mlItemId}
              {paused ? " · pausado" : ""}
            </span>
          </p>
        </div>
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
      </header>

      {listing.today ? (
        <TodayStrip
          today={listing.today}
          lastCompleteRunLabel={lastCompleteRunLabel}
          targetPercent={targetPercent}
        />
      ) : (
        <p className="flex gap-2 border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-xs leading-relaxed text-[var(--muted-foreground)] sm:px-5">
          <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
          <span>
            Este anúncio ainda não passou pelo Atualizar da{" "}
            <Link href="/dashboard/central-anuncios" className={LINK_CLASS}>
              Central de anúncios
            </Link>
            : sem atalhos de preço, e a conta lê custo, imposto e ADS na hora (leva alguns
            segundos).
          </span>
        </p>
      )}

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <RotinaPriceSimulator
          mlItemId={listing.mlItemId}
          listingTypeId={listing.listingTypeId}
          suggestions={listing.suggestions}
          defaultPrice={listing.defaultPrice}
          timeZone={timeZone}
          autoRun={false}
          priceInputRef={priceInputRef}
          api={api}
          target={{ percent: targetPercent, saved: listing.targetPercent }}
          controls={
            <CalculatorTargetControl
              value={targetPercent}
              saved={listing.targetPercent}
              ownTarget={listing.ownTarget}
              onChange={setTargetPercent}
            />
          }
        />
      </div>
    </article>
  );
}
