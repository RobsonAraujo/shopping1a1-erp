import { cn } from "@/lib/utils";

/**
 * Cor de cada tipo de opção de venda — é **categoria** (nomeia o tipo do
 * anúncio, como Próprio/Catálogo), nunca estado: o "Perdendo" e afins
 * continuam na pílula do card. Azul e magenta não se confundem com o roxo da
 * etiqueta Catálogo nem com o vermelho de alerta.
 */
export type OptionTypeTone = "classic" | "premium" | "other";

/** Pelo `listing_type_id` (`gold_special`, `gold_pro`) ou pelo rótulo ("Clássico…", "Premium…"). */
export function optionTypeTone(value: string | null | undefined): OptionTypeTone {
  if (!value) return "other";
  if (value === "gold_special" || value.startsWith("Clássico")) return "classic";
  if (value === "gold_pro" || value.startsWith("Premium")) return "premium";
  return "other";
}

const BADGE_CLASS: Record<OptionTypeTone, string> = {
  classic: "bg-sky-50 text-sky-700 ring-sky-200",
  premium: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  other: "bg-[var(--primary)]/10 text-[var(--primary)] ring-[var(--primary)]/20",
};

/** Faixa à esquerda de uma opção dentro do produto (card das Ações, linha da Calculadora). */
export const OPTION_TYPE_STRIPE_CLASS: Record<OptionTypeTone, string> = {
  classic: "border-l-4 border-l-sky-500",
  premium: "border-l-4 border-l-fuchsia-500",
  other: "border-l-4 border-l-[var(--primary)]/50",
};

/**
 * O tipo da opção de venda em destaque ("Clássico", "Premium"…): etiqueta
 * cheia, na cor do tipo, para a opção não se confundir com a outra do mesmo
 * produto. Calculadora e Ações do dia usam a mesma.
 */
export function OptionTypeBadge({
  label,
  listingTypeId,
  className,
}: {
  label: string;
  /** Decide a cor; sem ele, a cor sai do rótulo. */
  listingTypeId?: string | null;
  className?: string;
}) {
  const tone = optionTypeTone(listingTypeId ?? label);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold leading-tight ring-1 ring-inset",
        BADGE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
