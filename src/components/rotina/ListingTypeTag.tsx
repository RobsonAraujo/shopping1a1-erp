import { cn } from "@/lib/utils";

const LISTING_TYPE_LABELS: Record<string, string> = {
  gold_special: "Clássico",
  gold_pro: "Premium",
};

/** "Clássico" / "Premium", ou `null` para outros tipos e tipo desconhecido. */
export function listingTypeShortLabel(listingTypeId: string | null | undefined): string | null {
  return listingTypeId ? (LISTING_TYPE_LABELS[listingTypeId] ?? null) : null;
}

/**
 * Etiqueta do tipo do anúncio (Clássico / Premium). Tom neutro de propósito:
 * as cores ficam com Próprio/Catálogo e com o status da tarefa.
 */
export function ListingTypeTag({
  listingTypeId,
  className,
}: {
  listingTypeId: string | null | undefined;
  className?: string;
}) {
  const label = listingTypeShortLabel(listingTypeId);
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-1.5 py-0.5 text-[11px] font-medium leading-none text-[var(--muted-foreground)]",
        className,
      )}
    >
      {label}
    </span>
  );
}
