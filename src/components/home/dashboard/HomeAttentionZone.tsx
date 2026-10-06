"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useHomeCore } from "@/components/home/dashboard/HomeDashboardProvider";
import {
  HOME_ATTENTION_MONITORS,
  buildHomeAttentionSignals,
} from "@/lib/home/dashboard/home-attention";
import { STATUS_PILL_CLASS } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

/**
 * "Precisa da sua atenção" — a primeira coisa da Home.
 *
 * Quando não há nada pendente a seção **não desaparece**: colapsa numa linha
 * só, listando o que está sendo monitorado. Esse era um princípio explícito
 * do desenho anterior (seção de alerta vazia que some faz o usuário achar que
 * o recurso não existe) e continua valendo — o que muda é o espaço gasto:
 * uma linha em vez de uma tela.
 */
export function HomeAttentionZone() {
  const core = useHomeCore();
  const signals = useMemo(() => buildHomeAttentionSignals(core), [core]);

  if (signals.length === 0) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-3xl bg-[var(--card)] px-4 py-3.5 sm:px-5"
      >
        <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
        <p className="text-sm font-medium text-[var(--foreground)]">
          Tudo em ordem por aqui.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Monitorando {HOME_ATTENTION_MONITORS.join(" · ")}
        </p>
      </div>
    );
  }

  const total = signals.reduce((sum, signal) => sum + signal.count, 0);

  return (
    <section
      aria-label="Precisa da sua atenção"
      className="rounded-3xl bg-[var(--card)] p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] sm:p-5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-[var(--muted-foreground)]">
          Precisa da sua atenção
        </h2>
        <span className="text-sm tabular-nums text-rose-700">
          {total.toLocaleString("pt-BR")}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {signals.map((signal) => {
          const pill = STATUS_PILL_CLASS[signal.tone];
          return (
            <li key={signal.id}>
              <Link
                href={signal.href}
                // A lista completa fica no título — o visível é cortado. Só
                // quando há detalhe: definir `aria-label` nos outros pills
                // mudaria o nome acessível deles sem motivo. E como `aria-label`
                // SUBSTITUI o texto visível, ele repete contagem e rótulo.
                title={signal.detailFull}
                aria-label={
                  signal.detailFull
                    ? `${signal.count.toLocaleString("pt-BR")} ${signal.label}: ${signal.detailFull}`
                    : undefined
                }
                className={cn(
                  "flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-opacity hover:opacity-80",
                  pill.wrap,
                )}
              >
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", pill.dot)}
                  aria-hidden
                />
                <span className="shrink-0 font-semibold tabular-nums">
                  {signal.count.toLocaleString("pt-BR")}
                </span>
                <span className="shrink-0 whitespace-nowrap">{signal.label}</span>
                {signal.detail ? (
                  <>
                    {/* O mesmo "·" que o estado vazio desta seção já usa. */}
                    <span aria-hidden className="shrink-0 opacity-50">
                      ·
                    </span>
                    {/* O único item que encolhe (os outros são `shrink-0`):
                        degrada em elipse em vez de estourar o cartão. Escondido
                        no celular, onde não cabe — a informação continua no card
                        de pendências e no título. */}
                    <span className="hidden min-w-0 truncate opacity-70 sm:block">
                      {signal.detail}
                    </span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
