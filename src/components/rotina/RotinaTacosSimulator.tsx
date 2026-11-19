"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { TacosBasisToggle } from "@/components/shared/TacosBasisToggle";
import { RotinaPriceSimulator } from "@/components/rotina/RotinaPriceSimulator";
import {
  adsSpendWithoutSales,
  type TacosAds,
  type TacosBasis,
} from "@/lib/pricing/tacos-basis";
import { formatClock, formatMoney } from "@/lib/rotina/format";
import { fetchSimulationAds } from "@/lib/rotina/simulator-api";

type TodayAdsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; ads: TacosAds; readAt: string };

type SimulatorProps = Omit<
  ComponentProps<typeof RotinaPriceSimulator>,
  "adsOverride" | "tacosBasis" | "floorScope" | "refreshFloor" | "inputsNote" | "controls"
>;

const LINK_CLASS =
  "cursor-pointer rounded font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/**
 * O "Simular" da Central com a escolha do TACOS: os **7 dias** do Atualizar
 * (o mesmo das tarefas, sem chamada a mais, e vale o Mínimo da rodada) ou o
 * de **hoje**, lido agora (+1–2 chamadas, uma vez). Trocar refaz os preços já
 * cotados no navegador, sem cotar de novo; o mínimo no TACOS de hoje sai sob
 * demanda. A escolha vale para este simulador.
 */
export function RotinaTacosSimulator({
  initialBasis,
  ...props
}: SimulatorProps & {
  /** "Ajustar margem" e "Revisar ADS" abrem em 7 dias; o resto, em hoje. */
  initialBasis: TacosBasis;
}) {
  const { mlItemId, timeZone } = props;
  const [basis, setBasis] = useState<TacosBasis>(initialBasis);
  const [today, setToday] = useState<TodayAdsState | null>(null);
  const started = useRef(false);

  const loadToday = useCallback(() => {
    fetchSimulationAds(mlItemId, "today").then(
      (ads) => setToday({ status: "done", ads, readAt: new Date().toISOString() }),
      (e: unknown) =>
        setToday({
          status: "error",
          message:
            e instanceof Error && e.message
              ? e.message
              : "Não foi possível ler o TACOS de hoje agora.",
        }),
    );
  }, [mlItemId]);

  // Abriu em "Hoje" (ou trocou para ele): lê uma vez.
  useEffect(() => {
    if (basis !== "today" || started.current) return;
    started.current = true;
    loadToday();
  }, [basis, loadToday]);

  function retryToday() {
    setToday({ status: "loading" });
    loadToday();
  }

  const todayAds = today?.status === "done" ? today : null;
  // A conta só troca para hoje quando ele chega: o rótulo sempre casa com o número.
  const usingToday = basis === "today" && todayAds !== null;
  const loadingToday = basis === "today" && (today === null || today.status === "loading");
  const errorToday = basis === "today" && today?.status === "error" ? today.message : null;
  const spentWithoutSales = usingToday && adsSpendWithoutSales(todayAds.ads);

  return (
    <RotinaPriceSimulator
      {...props}
      adsOverride={usingToday ? todayAds.ads : null}
      tacosBasis={usingToday ? "today" : undefined}
      floorScope={usingToday ? "today" : "7d"}
      refreshFloor={!usingToday}
      inputsNote={
        usingToday ? (
          <>
            Custo e imposto da última atualização; TACOS de hoje lido às{" "}
            {formatClock(todayAds.readAt, timeZone)}.
          </>
        ) : undefined
      }
      controls={
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TacosBasisToggle
              basis={basis}
              loadingBasis={loadingToday ? "today" : null}
              onChange={setBasis}
            />
            <span className="text-[11px] text-[var(--muted-foreground)]">
              {usingToday
                ? `hoje até ${formatClock(todayAds.readAt, timeZone)}`
                : "últimos 7 dias, da atualização"}
            </span>
          </div>
          {errorToday ? (
            <p className="text-xs text-rose-700">
              {errorToday}{" "}
              <button type="button" onClick={retryToday} className={LINK_CLASS}>
                Tentar de novo
              </button>
            </p>
          ) : null}
          {spentWithoutSales ? (
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              Hoje: {formatMoney(todayAds.ads.adsCost ?? 0)} de ADS e nenhuma venda ainda. O TACOS
              não sai e a conta decide pela MC.{" "}
              <button type="button" onClick={() => setBasis("7d")} className={LINK_CLASS}>
                Usar o TACOS de 7 dias
              </button>
            </p>
          ) : null}
        </div>
      }
    />
  );
}
