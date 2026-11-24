"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listingTypeLabel } from "@/components/stock/stock-format";
import { cn } from "@/lib/utils";

/** O mínimo de uma opção de venda para mostrar a etiqueta (vem de `ListingOption`). */
export type ListingOptionChip = {
  mlItemId: string;
  listingTypeId: string | null;
  catalogListing?: boolean | null;
  registered?: boolean;
  isPrincipal?: boolean;
};

/** "Clássico", "Premium"… e Catálogo/Próprio só quando as opções diferem nisso. */
export function listingOptionLabel(
  option: ListingOptionChip,
  options: readonly ListingOptionChip[],
): string {
  const type = listingTypeLabel(option.listingTypeId);
  const catalogValues = new Set(options.map((o) => o.catalogListing ?? null));
  if (catalogValues.size <= 1 || option.catalogListing == null) return type;
  return `${type} · ${option.catalogListing ? "Catálogo" : "Próprio"}`;
}

/** "Clássico + Premium" — resumo das opções de um produto. */
export function listingOptionsSummary(options: readonly ListingOptionChip[]): string {
  return options.map((option) => listingOptionLabel(option, options)).join(" + ");
}

/**
 * Etiquetas das opções de venda de um produto (o mesmo padrão do Estoque):
 * uma por anúncio, o principal primeiro. Some quando o produto tem um
 * anúncio só. Cadastro duplicado (uma opção que também foi cadastrada como
 * produto) aparece marcado, com o botão de remover quando a tela permite.
 */
export function ListingOptionChips({
  options,
  onRemoveDuplicate,
  removingId,
  className,
}: {
  options: readonly ListingOptionChip[] | undefined;
  onRemoveDuplicate?: (option: ListingOptionChip) => void;
  removingId?: string | null;
  className?: string;
}) {
  if (!options || options.length <= 1) return null;
  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-1", className)}>
      <span
        className="cursor-help text-[10px] text-[var(--muted-foreground)]"
        title="O mesmo produto anunciado em mais de uma opção (Clássico, Premium…). O cadastro, o estoque e as vendas valem para o produto; preço e tarifa continuam de cada anúncio."
      >
        Opções de venda:
      </span>
      {options.map((option) => {
        const duplicate = Boolean(option.registered && !option.isPrincipal);
        return (
          <span key={option.mlItemId} className="inline-flex items-center gap-1">
            <Link href={`/dashboard/items/${option.mlItemId}`} title={option.mlItemId}>
              <Badge
                variant={option.isPrincipal ? "outline" : "muted"}
                className="px-1.5 py-0 text-[10px] font-normal hover:bg-[var(--accent)]"
              >
                {listingOptionLabel(option, options)} · {option.mlItemId}
              </Badge>
            </Link>
            {duplicate ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                cadastro duplicado
                {onRemoveDuplicate ? (
                  <button
                    type="button"
                    className="font-medium text-[var(--primary)] underline underline-offset-2 disabled:opacity-50"
                    disabled={removingId === option.mlItemId}
                    onClick={() => onRemoveDuplicate(option)}
                  >
                    {removingId === option.mlItemId ? "removendo…" : "remover"}
                  </button>
                ) : null}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
