import type { RotinaFloorView } from "@/lib/rotina/floor-view";
import type { RotinaListingRow } from "@/lib/rotina/view";

/**
 * Atalhos de preço do simulador ("Preço p/ ganhar", "Mínimo", "−10%"…). Puro e
 * sem "use client": a Central monta no navegador, a Calculadora no servidor —
 * a mesma função, os mesmos atalhos.
 */

/** `kind: "floor"` = o mínimo da rodada, que só vale no tipo de hoje. */
export type SimulatorSuggestion = { label: string; price: number; kind?: "floor" };

/** Descontos de promoção oferecidos em anúncio próprio (% sobre o preço original). */
export const PROMO_DISCOUNT_SHORTCUTS = [5, 10, 15, 20];

/** Atalhos do simulador conforme o tipo de ação. */
export function buildSimulatorSuggestions(args: {
  priceToWin: number | null;
  suggestedPrice: number | null;
  floor: Pick<RotinaFloorView, "effectivePrice" | "discountBase"> | null;
  salePrice: number | null;
  /** Atalhos de desconto (promoção): % sobre o preço original. */
  discounts?: number[];
  /** Subir preço no catálogo: as duas estimativas. */
  raise?: { winCeiling: number | null; shareCeiling: number | null } | null;
}): SimulatorSuggestion[] {
  const list: SimulatorSuggestion[] = [];
  const push = (label: string, price: number | null | undefined, kind?: "floor") => {
    if (price === null || price === undefined || price <= 0) return;
    const rounded = Math.round(price * 100) / 100;
    if (list.some((entry) => Math.abs(entry.price - rounded) < 0.005)) return;
    list.push(kind ? { label, price: rounded, kind } : { label, price: rounded });
  };
  push("Ganhar sozinho (estim.)", args.raise?.winCeiling);
  push("Dividir (estim.)", args.raise?.shareCeiling);
  push("Preço p/ ganhar", args.priceToWin);
  push("Abaixo da faixa", args.suggestedPrice);
  push("Mínimo", args.floor?.effectivePrice, "floor");
  push("Preço de hoje", args.salePrice);
  const base = args.floor?.discountBase ?? null;
  if (base !== null) {
    for (const discount of args.discounts ?? []) {
      push(`−${discount}%`, base * (1 - discount / 100));
    }
  }
  return list;
}

/**
 * Atalhos e preço inicial de um anúncio da lista "Todos os anúncios" (aba
 * Anúncios da Central e Calculadora): fora de uma tarefa, o que importa é
 * ganhar o catálogo disputado, o teto de quem ganha e o mínimo.
 */
export function simulatorSetupForListing(
  row: Pick<
    RotinaListingRow,
    "catalogStatus" | "priceToWin" | "floor" | "salePrice" | "catalogListing" | "raiseCeiling"
  >,
): { suggestions: SimulatorSuggestion[]; defaultPrice: number | null } {
  const contested = row.catalogStatus === "losing" || row.catalogStatus === "shared";
  const priceToWin = contested ? row.priceToWin : null;
  return {
    suggestions: buildSimulatorSuggestions({
      priceToWin,
      suggestedPrice: null,
      floor: row.floor,
      salePrice: row.salePrice,
      discounts: row.catalogListing ? undefined : PROMO_DISCOUNT_SHORTCUTS,
      raise: row.raiseCeiling !== null ? { winCeiling: row.raiseCeiling, shareCeiling: null } : null,
    }),
    defaultPrice: priceToWin ?? row.raiseCeiling ?? row.floor.effectivePrice ?? row.salePrice,
  };
}
