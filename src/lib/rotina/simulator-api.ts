import { readApiError } from "@/lib/api/api-client-error";
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
};

export type SimulatorApi = {
  simulate(request: SimulateRequest): Promise<RotinaSimulation>;
  floor(request: FloorRequest): Promise<RotinaTypeFloor>;
};

async function postJson<T>(url: string, body: unknown, fallbackCode: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readApiError(response, fallbackCode));
  return (await response.json()) as T;
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
