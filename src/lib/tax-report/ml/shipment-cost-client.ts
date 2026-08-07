import { getMercadoLibreConfig } from "@/lib/mercadolibre/config";
import { MlApiFetchError, fetchWithRetry } from "@/lib/mercadolibre/fetch-with-retry";

/**
 * Resposta de `GET /shipments/{id}/costs`. O custo efetivamente pago pelo
 * vendedor (frete que a empresa banca, ex.: frete grátis subsidiado) vem em
 * `senders[0].cost` — validado contra respostas reais do ML.
 */
export type ShipmentCostResponse = {
  senders?: Array<{ cost?: number | null }>;
  receiver?: { cost?: number | null };
};

export function parseShipmentCostResponse(
  response: ShipmentCostResponse | null,
): number | null {
  if (!response) return null;
  const senderCost = response.senders?.[0]?.cost;
  if (typeof senderCost === "number" && Number.isFinite(senderCost)) {
    return senderCost;
  }
  return null;
}

/** Custo de frete pago pela empresa neste envio, ou `null` se indisponível (404/campo ausente). */
export async function fetchShipmentCost(
  accessToken: string,
  shippingId: number,
): Promise<number | null> {
  const { apiBase } = getMercadoLibreConfig();
  const url = `${apiBase}/shipments/${shippingId}/costs`;

  try {
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const json = (await res.json()) as ShipmentCostResponse;
    return parseShipmentCostResponse(json);
  } catch (err) {
    if (err instanceof MlApiFetchError && err.status === 404) return null;
    throw err;
  }
}
