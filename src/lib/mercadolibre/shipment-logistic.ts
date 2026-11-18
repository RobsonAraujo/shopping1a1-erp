import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import { MlApiFetchError, fetchWithRetry } from "@/lib/mercadolibre/fetch-with-retry";

/**
 * Parte de `GET /shipments/{id}` que diz a forma de envio. Com
 * `x-format-new: true` vem em `logistic.type`; no formato antigo, em
 * `logistic_type` (os dois conferidos com envios reais em nov/2026).
 * Ex.: `fulfillment` (Full), `self_service` (Flex), `xd_drop_off` (Coleta).
 */
export type ShipmentLogisticResponse = {
  logistic?: { type?: string | null; mode?: string | null } | null;
  logistic_type?: string | null;
};

export function parseShipmentLogisticType(
  response: ShipmentLogisticResponse | null,
): string | null {
  if (!response) return null;
  const type = response.logistic?.type ?? response.logistic_type ?? null;
  return typeof type === "string" && type.trim() ? type.trim() : null;
}

/** Tipo logístico do envio, ou `null` se o ML não o tiver (404/campo ausente). */
export async function fetchShipmentLogisticType(
  accessToken: string,
  shipmentId: number | string,
  signal?: AbortSignal,
): Promise<string | null> {
  const { apiBase } = getMercadoLibreConfig();
  const url = `${apiBase}/shipments/${shipmentId}`;
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-format-new": "true",
      },
      cache: "no-store",
      signal,
    });
    return parseShipmentLogisticType((await res.json()) as ShipmentLogisticResponse);
  } catch (err) {
    if (err instanceof MlApiFetchError && err.status === 404) return null;
    throw err;
  }
}
