"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { DreEditableLineKey } from "@/lib/dre/dre-calculations";
import { cn } from "@/lib/utils";

/**
 * Coluna de um mês recalculando depois de uma edição manual: o servidor grava o
 * mês e devolve o ano inteiro, o que leva alguns segundos. Enquanto isso a
 * célula editada (`editedKey`) já mostra o valor novo e o resto da coluna fica
 * borrado — são os números que vão mudar. `editedKey: null` (restaurar do sync)
 * borra a coluna inteira.
 */
export type DreRecalc = { month: number; editedKey: string | null };

const DreRecalcContext = createContext<DreRecalc | null>(null);

export function DreRecalcProvider({
  value,
  children,
}: {
  value: DreRecalc | null;
  children: ReactNode;
}) {
  return (
    <DreRecalcContext.Provider value={value}>{children}</DreRecalcContext.Provider>
  );
}

export function useDreRecalc(): DreRecalc | null {
  return useContext(DreRecalcContext);
}

/** Identidade da célula editada: linha do ML/ERP. */
export function dreRecalcLineKey(lineKey: DreEditableLineKey): string {
  return `line:${lineKey}`;
}

/** Identidade da célula editada: item de custo manual (fixo, operacional…). */
export function dreRecalcCostKey(costItemId: string): string {
  return `cost:${costItemId}`;
}

export function isDreRecalculating(
  recalc: DreRecalc | null,
  month: number,
): boolean {
  return recalc !== null && recalc.month === month;
}

/** Mesmo borrado do `BlurredValue` (valor chegando), sobre o número antigo. */
export const DRE_RECALC_BLUR_CLASS =
  "pointer-events-none select-none blur-[3px] opacity-60";

export const DRE_RECALC_TRANSITION_CLASS =
  "transition-[filter,opacity] duration-200 ease-out";

/**
 * Borra o conteúdo enquanto a coluna do mês recalcula. Componente (e não só a
 * classe) para servir dentro das funções de render da tabela, que não podem
 * chamar hook.
 */
export function DreRecalcValue({
  month,
  as: Tag = "span",
  className,
  children,
}: {
  month: number;
  as?: "span" | "div";
  className?: string;
  children: ReactNode;
}) {
  const active = isDreRecalculating(useDreRecalc(), month);
  // `span` continua inline (o `filter` vale em inline): `inline-block` cortaria
  // o sublinhado pontilhado de auditoria do valor, que vem do pai.
  return (
    <Tag
      className={cn(
        DRE_RECALC_TRANSITION_CLASS,
        active && DRE_RECALC_BLUR_CLASS,
        className,
      )}
      aria-busy={active || undefined}
    >
      {children}
    </Tag>
  );
}

export function DreRecalcStatus({ className }: { className?: string }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-[var(--primary)]",
        className,
      )}
    >
      <Loader2 className="size-3 animate-spin" aria-hidden />
      Recalculando…
    </span>
  );
}
