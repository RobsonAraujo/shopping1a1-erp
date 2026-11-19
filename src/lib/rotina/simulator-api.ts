import { readApiError } from "@/lib/api/api-client-error";
import type { TacosAds, TacosBasis } from "@/lib/pricing/tacos-basis";
import type {
  RotinaSimulation,
  RotinaTypeFloor,
  SimulatableListingType,
} from "@/lib/rotina/simulate";

/**
 * As duas chamadas do simulador de preço, atrás de uma interface: o painel usa
 * as rotas (`fetchSimulatorApi`, cotação real no ML); a demonstração da
 * landing injeta uma versão local com dados de exemplo — a mesma tela, a mesma
 * conta de margem.
 */

export type SimulateRequest = {
  mlItemId: string;
  /** Omitido = o preço de hoje. */
  prices?: number[];
  /** Outro tipo (Clássico ↔ Premium). Omitido = o tipo de hoje. */
  listingTypeId?: SimulatableListingType;
};

export type FloorRequest = {
  mlItemId: string;
  /** Omitido = o tipo de hoje. */
  listingTypeId?: SimulatableListingType;
  /** Margem mínima que o usuário aceita (Calculadora). Omitida = a meta efetiva. */
  targetPercent?: number;
  /**
   * Central: `today` = o mínimo com o TACOS de hoje (o retrato é de 7 dias).
   * A Calculadora ignora: os insumos dela já levam o ADS da base escolhida.
   */
  tacosBasis?: TacosBasis;
};

export type SimulatorApi = {
  simulate(request: SimulateRequest): Promise<RotinaSimulation>;
  floor(request: FloorRequest): Promise<RotinaTypeFloor>;
};

/** POST com JSON; erro da rota vira `Error` com a mensagem para o usuário. */
export async function postJson<T>(url: string, body: unknown, fallbackCode: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readApiError(response, fallbackCode));
  return (await response.json()) as T;
}

/** O ADS de um anúncio da Central agora, numa base (o "TACOS de hoje" do simular). */
export function fetchSimulationAds(mlItemId: string, basis: TacosBasis): Promise<TacosAds> {
  return postJson<TacosAds>(
    "/api/rotina/simulate/ads",
    { mlItemId, basis },
    "rotina_simulate_ads_failed",
  );
}

export const fetchSimulatorApi: SimulatorApi = {
  simulate: (request) =>
    postJson<RotinaSimulation>("/api/rotina/simulate", request, "rotina_simulate_failed"),
  floor: (request) =>
    postJson<RotinaTypeFloor>(
      "/api/rotina/simulate/floor",
      request,
      "rotina_simulate_floor_failed",
    ),
};
