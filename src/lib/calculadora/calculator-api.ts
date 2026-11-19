import {
  inputsWithAds,
  type CalculatorAds,
  type CalculatorReading,
} from "@/lib/calculadora/reading";
import type { RotinaSimulation, RotinaTypeFloor } from "@/lib/rotina/simulate";
import { postJson, type SimulatorApi } from "@/lib/rotina/simulator-api";

/**
 * As chamadas da Calculadora atrás de uma interface: a página usa as rotas
 * (`fetchCalculatorApi`, leitura ao vivo no ML); a demonstração da landing
 * injeta uma versão local com dados de exemplo — a mesma tela, a mesma conta.
 */
export type CalculatorApi = {
  /** Lê o anúncio agora: preço, taxa e frete, custo, imposto e TACOS de hoje. */
  read(mlItemId: string): Promise<CalculatorReading>;
  /** O TACOS de 7 dias, quando o usuário troca a base. */
  ads7d(mlItemId: string): Promise<CalculatorAds>;
  /** O simulador de um anúncio lido, com o ADS da base escolhida. */
  simulatorFor(reading: CalculatorReading, ads: CalculatorAds): SimulatorApi;
};

/** O que toda simulação manda de volta: a leitura, para só cotar taxa e frete. */
function listingContext(reading: CalculatorReading, ads: CalculatorAds) {
  return {
    mlItemId: reading.mlItemId,
    inputs: inputsWithAds(reading.inputs, ads),
    salePrice: reading.price,
    regularPrice: reading.regularPrice,
    pmaPrice: reading.pmaPrice,
    blocked: reading.blocked,
    readAt: reading.readAt,
  };
}

export const fetchCalculatorApi: CalculatorApi = {
  read: (mlItemId) =>
    postJson<CalculatorReading>("/api/calculadora/read", { mlItemId }, "calculator_read_failed"),
  ads7d: (mlItemId) =>
    postJson<CalculatorAds>(
      "/api/calculadora/ads",
      { mlItemId, basis: "7d" },
      "calculator_ads_failed",
    ),
  simulatorFor(reading, ads) {
    const context = listingContext(reading, ads);
    return {
      simulate: ({ prices, listingTypeId }) =>
        postJson<RotinaSimulation>(
          "/api/calculadora/simulate",
          {
            ...context,
            targetPercent: reading.targetPercent,
            prices: prices && prices.length > 0 ? prices : [reading.price],
            ...(listingTypeId ? { listingTypeId } : {}),
          },
          "calculator_simulate_failed",
        ),
      floor: ({ listingTypeId, targetPercent }) =>
        postJson<RotinaTypeFloor>(
          "/api/calculadora/floor",
          {
            ...context,
            targetPercent: targetPercent ?? reading.targetPercent,
            ...(listingTypeId ? { listingTypeId } : {}),
          },
          "calculator_floor_failed",
        ),
    };
  },
};
