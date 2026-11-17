"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { formatPercent } from "@/lib/rotina/format";
import { ROTINA_MARGIN_LIMITS } from "@/lib/rotina/settings-shared";

/** Passo dos botões −/+ e das setas do teclado (pontos percentuais). */
export const TARGET_STEP = 0.5;

/** "5", "5,5", "-2", "3 %" → número com 1 casa; `null` enquanto não é número. */
export function parseTargetInput(raw: string): number | null {
  const text = raw.replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  if (!text || text === "-" || text === ".") return null;
  const value = Number(text);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

export function clampTarget(value: number): number {
  return Math.min(ROTINA_MARGIN_LIMITS.max, Math.max(ROTINA_MARGIN_LIMITS.min, value));
}

function draftOf(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * "Margem mínima que eu aceito": abre na meta que já vale (a própria do
 * anúncio ou a do segmento) e o usuário mexe à vontade para testar. Mudar
 * aqui não grava nada nem chama o ML: o veredito muda na hora.
 */
export function CalculatorTargetControl({
  value,
  saved,
  ownTarget,
  onChange,
}: {
  value: number;
  /** A meta que já vale na Central. */
  saved: number;
  ownTarget: boolean;
  onChange: (next: number) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(() => draftOf(value));
  const differs = Math.abs(value - saved) > 1e-9;
  const savedLabel = ownTarget ? "Meta própria" : "Meta da Central";

  function commit(next: number) {
    const clamped = clampTarget(Math.round(next * 10) / 10);
    setDraft(draftOf(clamped));
    onChange(clamped);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(value + (event.key === "ArrowUp" ? TARGET_STEP : -TARGET_STEP));
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/25 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor={inputId} className="text-xs font-medium text-[var(--foreground)]">
          Margem mínima que eu aceito
        </label>
        <div className="inline-flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Diminuir ${draftOf(TARGET_STEP)} ponto`}
            disabled={value <= ROTINA_MARGIN_LIMITS.min}
            onClick={() => commit(value - TARGET_STEP)}
          >
            <Minus aria-hidden />
          </Button>
          <div className="relative">
            <FormInput
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                const parsed = parseTargetInput(event.target.value);
                if (parsed !== null) onChange(clampTarget(parsed));
              }}
              onBlur={() => setDraft(draftOf(value))}
              onKeyDown={onKeyDown}
              className="w-[4.5rem]"
              inputClassName="h-8 pr-6 text-center font-semibold tabular-nums sm:h-8"
            />
            <span
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]"
              aria-hidden
            >
              %
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Aumentar ${draftOf(TARGET_STEP)} ponto`}
            disabled={value >= ROTINA_MARGIN_LIMITS.max}
            onClick={() => commit(value + TARGET_STEP)}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {differs ? (
            <>
              {savedLabel}: {formatPercent(saved)} ·{" "}
              <button
                type="button"
                onClick={() => commit(saved)}
                className="cursor-pointer rounded font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                voltar
              </button>
            </>
          ) : ownTarget ? (
            "a meta própria deste anúncio"
          ) : (
            "a meta da Central"
          )}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[var(--muted-foreground)]">
        Só para testar aqui: não muda a meta da Central. Vale para a margem após ADS (MC
        quando o anúncio não tem ADS).
      </p>
    </div>
  );
}
