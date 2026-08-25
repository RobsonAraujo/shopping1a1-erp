/**
 * Sistema de tom compartilhado — nasceu no Demonstrativo do DRE
 * (`dre-year-table.tsx`) e virou vocabulário do produto. Duas famílias que
 * não devem se misturar:
 *
 * - **Tom de categoria** (`CategoryTone`): nomeia um grupo (Custos
 *   Variáveis, Custo Fixo...). Nunca significa "bom" ou "ruim".
 * - **Tom semântico** (`StatusTone`): diz como está indo algo (atrasado,
 *   precisa de atenção, ok). Vive em badges/pills de estado, não em cards
 *   de agrupamento.
 */

export type CategoryTone = "primary" | "rose" | "amber" | "violet" | "emerald";

/** Ícone/badge de cabeçalho de categoria — fundo suave + texto colorido. */
export const CATEGORY_BADGE_CLASS: Record<CategoryTone, string> = {
  primary: "bg-[var(--primary)]/10 text-[var(--primary)]",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

/** Fundo sutil pra linha/seção inteira (tabelas densas), mais discreto que o badge. */
export const CATEGORY_ROW_TINT_CLASS: Record<CategoryTone, string> = {
  primary: "bg-[var(--primary)]/[0.06]",
  rose: "bg-rose-50/60",
  amber: "bg-amber-50/60",
  violet: "bg-violet-50/60",
  emerald: "bg-emerald-50/60",
};

/** Cor sólida pra bordas desenhadas via box-shadow (evita brigar com
 * border-collapse em tabelas nativas). */
export const CATEGORY_BORDER_COLOR: Record<CategoryTone, string> = {
  primary: "color-mix(in srgb, var(--primary) 45%, transparent)",
  rose: "#fda4af",
  amber: "#fcd34d",
  violet: "#c4b5fd",
  emerald: "#6ee7b7",
};

/** Cor do texto (sem fundo) — pra usar em números/ícones soltos. */
export const CATEGORY_TEXT_CLASS: Record<CategoryTone, string> = {
  primary: "text-[var(--primary)]",
  rose: "text-rose-600",
  amber: "text-amber-600",
  violet: "text-violet-600",
  emerald: "text-emerald-600",
};

/**
 * Cor pelo sinal do valor — verde pra positivo, vermelho pra negativo.
 * Único critério: matemática, não é tom de categoria nem de status.
 */
export function valueToneClass(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "text-[var(--muted-foreground)]";
  }
  if (value > 0) return "text-emerald-800 dark:text-emerald-300";
  if (value < 0) return "text-rose-800 dark:text-rose-300";
  return "text-[var(--muted-foreground)]";
}

export type StatusTone = "danger" | "warning" | "ok" | "neutral";

/**
 * Pill de estado (não confundir com CategoryTone). "danger" reaproveita o
 * mesmo vermelho de `--destructive` do resto do app — é o único ponto onde
 * a cor semântica do produto já existia antes deste sistema.
 */
export const STATUS_PILL_CLASS: Record<
  StatusTone,
  { wrap: string; dot: string }
> = {
  danger: {
    wrap: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    dot: "bg-rose-600 dark:bg-rose-400",
  },
  warning: {
    wrap: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    dot: "bg-amber-600 dark:bg-amber-400",
  },
  ok: {
    wrap: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  neutral: {
    wrap: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    dot: "bg-[var(--muted-foreground)]",
  },
};
