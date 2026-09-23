/**
 * Cores das fatias de custo nas peças de marketing (calculadora de margem e
 * snapshot do hero). Ficam num arquivo só para que a mesma rubrica tenha a
 * mesma cor nas duas. Quem rola a página reconhece "tarifa ML" pela cor.
 *
 * Rampa rosa para o que sai (mais escuro = mais pesado), cinza para o custo
 * que não é do Mercado Livre e verde para o que sobra.
 */
export const COST_COLOR = {
  productCost: "#be123c",
  mlFee: "#e11d48",
  shipping: "#fb7185",
  tax: "#fda4af",
  ads: "#fecdd3",
  fixedCost: "#cbd5e1",
} as const;

export const PROFIT_COLOR = "#10b981";

export type CostColorKey = keyof typeof COST_COLOR;
