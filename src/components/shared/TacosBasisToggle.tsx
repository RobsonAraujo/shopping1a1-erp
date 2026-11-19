"use client";

import { Loader2 } from "lucide-react";
import type { TacosBasis } from "@/lib/pricing/tacos-basis";
import { cn } from "@/lib/utils";

const OPTIONS: { value: TacosBasis; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
];

/**
 * Escolha leve da base do TACOS numa simulação de preço: o de hoje (até agora)
 * ou o dos últimos 7 dias. Usado na Calculadora e no "Simular" da Central.
 */
export function TacosBasisToggle({
  basis,
  onChange,
  loadingBasis = null,
  className,
}: {
  basis: TacosBasis;
  onChange: (basis: TacosBasis) => void;
  /** A base que está sendo lida no ML (mostra o carregando nela). */
  loadingBasis?: TacosBasis | null;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Base do TACOS"
      className={cn("flex items-center gap-1.5", className)}
    >
      <span className="text-[11px] font-medium text-[var(--muted-foreground)]">TACOS de</span>
      {OPTIONS.map(({ value, label }) => {
        const pressed = basis === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              pressed
                ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {loadingBasis === value ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
