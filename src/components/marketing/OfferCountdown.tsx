"use client";

import { useSyncExternalStore } from "react";
import { offerTimeLeft } from "@/lib/marketing/campaign-offer";
import { cn } from "@/lib/utils";

/**
 * Contador da oferta da `/beta` até `BETA_OFFER.deadline` (prazo real, não
 * reinicia). O servidor renderiza com o horário dele (`serverNowMs`) e a
 * hidratação usa o mesmo valor, então não há divergência; depois disso o
 * relógio do navegador assume e o contador anda a cada segundo.
 *
 * Todos os contadores da página dividem um só `setInterval`.
 */

let now: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((listener) => listener());
    }, 1000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      now = null;
    }
  };
}

function getSnapshot(): number {
  if (now === null) now = Date.now();
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function OfferCountdown({
  serverNowMs,
  variant,
  className,
}: {
  serverNowMs: number;
  /** `blocks`: quadros DD HH MM SS · `text`: "08d 14h 22m 10s" · `short`: sem segundos. */
  variant: "blocks" | "text" | "short";
  className?: string;
}) {
  const nowMs = useSyncExternalStore(subscribe, getSnapshot, () => serverNowMs);
  const left = offerTimeLeft(new Date(nowMs));

  if (left.ended) {
    return <span className={className}>Oferta encerrada</span>;
  }

  if (variant === "blocks") {
    const parts = [
      { value: left.days, label: left.days === 1 ? "dia" : "dias" },
      { value: left.hours, label: "horas" },
      { value: left.minutes, label: "min" },
      { value: left.seconds, label: "seg" },
    ];
    return (
      <div role="timer" className={cn("grid grid-cols-4 gap-2", className)}>
        {parts.map((part) => (
          <div
            key={part.label}
            className="flex flex-col items-center rounded-xl bg-[#0f1a45] px-1 py-2.5 text-white"
          >
            <span className="font-mono text-2xl font-bold leading-none tabular-nums sm:text-[1.7rem]">
              {pad(part.value)}
            </span>
            <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-white/60">
              {part.label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const text =
    variant === "short"
      ? `${pad(left.days)}d ${pad(left.hours)}h ${pad(left.minutes)}m`
      : `${pad(left.days)}d ${pad(left.hours)}h ${pad(left.minutes)}m ${pad(left.seconds)}s`;

  return (
    <span role="timer" className={cn("font-mono tabular-nums", className)}>
      {text}
    </span>
  );
}
