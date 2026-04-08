import type { ItemBody } from "@/lib/mercadolibre/types";

/** Unidades disponíveis no anúncio (ML), conforme `available_quantity` / variações. */
export function mlAvailableStockUnits(item: ItemBody): number {
  const vars = item.variations;
  if (vars && vars.length > 0) {
    let sum = 0;
    let sawQty = false;
    for (const v of vars) {
      const q = v.available_quantity;
      if (typeof q === "number" && Number.isFinite(q)) {
        sawQty = true;
        sum += Math.max(0, Math.floor(q));
      }
    }
    if (sawQty) return sum;
  }
  const aq = item.available_quantity;
  if (typeof aq === "number" && Number.isFinite(aq)) {
    return Math.max(0, Math.floor(aq));
  }
  return 0;
}
