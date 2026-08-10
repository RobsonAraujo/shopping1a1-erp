import type { FullShipmentRecord } from "@/lib/envios-full/full-shipment";

export function formatShipmentDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function sourceLabel(source: FullShipmentRecord["source"]): string {
  return source === "ml_billing" ? "ML" : "Manual";
}
