"use client";

import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { TacosBasisToggle } from "@/components/shared/TacosBasisToggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adsSpendWithoutSales,
  marginNow,
  type CalculatorAds,
  type CalculatorReading,
  type TacosBasis,
} from "@/lib/calculadora/reading";
import { MARGIN_EXCLUSION_LABEL } from "@/lib/lucratividade/margin-summary";
import { formatClock, formatMoney, formatPercent, formatWhen } from "@/lib/rotina/format";
import type { SimulatedPrice } from "@/lib/rotina/simulate-margin";
import { STATUS_PILL_CLASS } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

const LINK_CLASS =
  "font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded";

const CATALOG_STATUS_TEXT = {
  losing: { tone: "danger", label: "Perdendo o catálogo" },
  shared: { tone: "warning", label: "Dividindo o 1º lugar" },
  winning: { tone: "ok", label: "Ganhando o catálogo" },
} as const;

/** "2026-11-12" → "12/11". */
function ymdShort(ymd: string): string {
  const [, month, day] = ymd.split("-");
  return month && day ? `${day}/${month}` : ymd;
}

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

/** Como no simulador: a margem que decide pela meta (dentro/abaixo); a outra só fica vermelha se negativa. */
function marginClass(
  margin: SimulatedPrice,
  basis: SimulatedPrice["decidingBasis"],
  value: number | null,
  targetPercent: number,
): string | undefined {
  if (value === null) return "text-[var(--muted-foreground)]";
  if (basis === margin.decidingBasis) {
    return value >= targetPercent - 1e-9 ? "text-emerald-800" : "text-rose-700";
  }
  return value < 0 ? "text-rose-800" : undefined;
}

/** "TACOS de hoje até 14:32" / "7 dias · 12/11–18/11". */
export function tacosWindowLabel(ads: CalculatorAds, readAt: string, timeZone: string): string {
  return ads.basis === "today"
    ? `hoje até ${formatClock(readAt, timeZone)}`
    : `7 dias · ${ymdShort(ads.from)}–${ymdShort(ads.to)}`;
}

/** "30 dias do Tributário, até 17/11" / "alíquota do Simples". */
export function taxSourceLabel(reading: CalculatorReading): string | null {
  const source = reading.taxSource;
  if (!source) return null;
  if (source.regime === "simples") return "alíquota do Simples";
  return source.window ? `30 dias · até ${ymdShort(source.window.to)}` : "do Tributário";
}

/**
 * Faixa "Agora": o anúncio lido agora no ML. Preço com promoção, MC e após
 * ADS com o TACOS da base escolhida, o TACOS e o imposto com a janela de cada
 * um. Trocar a base refaz a conta aqui, sem cotar de novo.
 */
export function CalculatorNowStrip({
  reading,
  ads,
  basis,
  loading7d,
  error7d,
  onBasisChange,
  onRetry7d,
  targetPercent,
  timeZone,
  refreshing,
  refreshError,
  onRefresh,
}: {
  reading: CalculatorReading;
  /** O ADS em uso (o de 7 dias só depois de lido). */
  ads: CalculatorAds;
  /** A base pedida pelo usuário (pode ainda estar carregando). */
  basis: TacosBasis;
  loading7d: boolean;
  error7d: string | null;
  onBasisChange: (basis: TacosBasis) => void;
  onRetry7d: () => void;
  targetPercent: number;
  timeZone: string;
  refreshing: boolean;
  refreshError: string | null;
  onRefresh: () => void;
}) {
  const margin = marginNow(reading, ads, targetPercent);
  const spendWithoutSales = adsSpendWithoutSales(ads);
  const catalog =
    reading.catalog && reading.catalog.status !== "unknown"
      ? { ...CATALOG_STATUS_TEXT[reading.catalog.status], priceToWin: reading.catalog.priceToWin }
      : null;
  const exclusion = reading.blocked ? MARGIN_EXCLUSION_LABEL[reading.blocked] : null;
  const notQuoted = !exclusion && !margin.quoted;

  return (
    <section
      aria-label="Agora"
      className={cn(
        "border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 transition-opacity sm:px-5",
        refreshing && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-[var(--foreground)]">
            Agora
            <span className="font-normal text-[var(--muted-foreground)]">
              {" "}
              · lido {formatWhen(reading.readAt, new Date(), timeZone)}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-6 px-1.5 text-xs"
            title="Lê o anúncio de novo no Mercado Livre"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
            Ler de novo
          </Button>
        </div>
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
            {catalog.priceToWin !== null && reading.catalog?.status !== "winning"
              ? ` · p/ ganhar ${formatMoney(catalog.priceToWin)}`
              : ""}
          </span>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
        <Stat
          label="Preço"
          value={formatMoney(reading.price)}
          hint={
            reading.hasPromotion
              ? reading.regularPrice !== null
                ? `em promoção · de ${formatMoney(reading.regularPrice)}`
                : "em promoção"
              : reading.promotionKnown
                ? null
                : "promoção não confirmada"
          }
        />
        <Stat
          label="MC"
          value={formatPercent(margin.marginPercent)}
          valueClassName={marginClass(margin, "contribution", margin.marginPercent, targetPercent)}
        />
        <Stat
          label="Após ADS"
          value={formatPercent(margin.marginAfterAdsPercent)}
          hint={
            !ads.available
              ? "ADS indisponível"
              : spendWithoutSales
                ? "TACOS não sai"
                : null
          }
          valueClassName={marginClass(
            margin,
            "afterAds",
            margin.marginAfterAdsPercent,
            targetPercent,
          )}
        />
        <Stat
          label="TACOS"
          value={ads.available ? formatPercent(ads.tacosPercent) : "—"}
          hint={tacosWindowLabel(ads, reading.readAt, timeZone)}
        />
        <Stat
          label="Imposto"
          value={formatPercent(reading.inputs.taxRatePercent)}
          hint={taxSourceLabel(reading)}
        />
      </dl>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <TacosBasisToggle
          basis={basis}
          loadingBasis={loading7d ? "7d" : null}
          onChange={onBasisChange}
        />
        {error7d ? (
          <span className="text-xs text-rose-700">
            {error7d}{" "}
            <button type="button" onClick={onRetry7d} className={LINK_CLASS}>
              Tentar de novo
            </button>
          </span>
        ) : null}
      </div>

      {spendWithoutSales ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          {ads.basis === "today" ? "Hoje" : "Nos 7 dias"}: {formatMoney(ads.adsCost ?? 0)} de ADS e
          nenhuma venda{ads.basis === "today" ? " ainda" : ""}. O TACOS não sai e a conta decide
          pela MC.
          {basis === "today" ? (
            <>
              {" "}
              <button type="button" onClick={() => onBasisChange("7d")} className={LINK_CLASS}>
                Usar o TACOS de 7 dias
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {notQuoted ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          O Mercado Livre não cotou taxa e frete no preço de agora. Simule um preço abaixo.
        </p>
      ) : null}
      {exclusion ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          {exclusion}: a margem não sai.{" "}
          <Link href="/dashboard/produtos" className={LINK_CLASS}>
            Completar em Meus produtos
          </Link>
        </p>
      ) : null}
      {refreshError ? <p className="mt-2 text-xs text-rose-700">{refreshError}</p> : null}
    </section>
  );
}

/** Enquanto lê o anúncio no ML (1–3 s). */
export function CalculatorNowStripSkeleton() {
  return (
    <section
      aria-label="Lendo o anúncio"
      aria-busy="true"
      className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 sm:px-5"
    >
      <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Lendo o anúncio no Mercado Livre…
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((key) => (
          <div key={key} className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
