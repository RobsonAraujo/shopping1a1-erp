"use client";

import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { CalculatorPageClient } from "@/components/calculadora/CalculatorPageClient";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { track } from "@/lib/analytics/track";
import {
  DEMO_LISTINGS,
  buildDemoCalculatorData,
  createDemoSimulatorApi,
} from "@/lib/rotina/calculator-demo";

/**
 * A Calculadora do painel na landing, com anúncios de exemplo. É a mesma tela
 * (`CalculatorPageClient` no modo `demo`) e a mesma conta de margem; só a taxa
 * e o frete saem de uma tabela simples em vez da cotação no Mercado Livre.
 * Tudo roda no navegador: nenhuma chamada a servidor.
 */
export function DemoCalculator({
  isLoggedIn,
  dashboardHref,
  connectHref,
  ctaLabel,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  /** A `/beta` passa a `/conectar` com a oferta. */
  connectHref?: string;
  ctaLabel?: string;
}) {
  // Montado uma vez: a demonstração não muda enquanto a página está aberta.
  const [demo] = useState(() => ({
    data: buildDemoCalculatorData(),
    api: createDemoSimulatorApi(),
  }));

  // Primeiro toque ou tecla na demo vira `demo_interaction` (sinal de interesse
  // no funil); só uma vez por visita.
  const interacted = useRef(false);
  const markInteraction = () => {
    if (interacted.current) return;
    interacted.current = true;
    track("demo_interaction", { demo: "calculadora" });
  };

  return (
    <div
      onPointerDownCapture={markInteraction}
      onKeyDownCapture={markInteraction}
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] text-left shadow-[0_1px_2px_rgba(15,18,31,0.04),0_24px_48px_-32px_rgba(27,45,111,0.35)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">Calculadora de preço</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Escolha um anúncio, digite um preço e aperte Enter
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted-foreground)]">
          Dados de exemplo
        </span>
      </div>

      <div className="p-3 sm:p-4">
        <CalculatorPageClient
          data={demo.data}
          initialSelectedId={DEMO_LISTINGS[1].mlItemId}
          variant="demo"
          api={demo.api}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--card)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Conectado, a lista é a sua loja inteira: custo, imposto e ADS vêm do seu cadastro,
            e taxa e frete são cotados no Mercado Livre a cada preço.
          </span>
        </p>
        <OAuthCta
          isLoggedIn={isLoggedIn}
          location="calculator"
          dashboardHref={dashboardHref}
          connectHref={connectHref}
          label={ctaLabel}
          size="sm"
          className="shrink-0"
        />
      </div>
    </div>
  );
}
