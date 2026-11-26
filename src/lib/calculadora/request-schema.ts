import { z } from "zod";
import { ROTINA_MARGIN_LIMITS } from "@/lib/rotina/settings-shared";
import { SIMULATABLE_LISTING_TYPES } from "@/lib/rotina/simulate";

/**
 * Pedidos das rotas da Calculadora. A leitura ao vivo devolve os insumos da
 * conta (custo, imposto, rebate, ADS da base escolhida) e o navegador os manda
 * de volta em cada simulação: assim cada preço só cota taxa e frete, sem ler o
 * anúncio inteiro de novo. Os insumos só servem para calcular um número que
 * volta para o mesmo usuário — nada é gravado.
 */

const MAX_MONEY = 10_000_000;

const mlItemId = z.string().regex(/^[A-Z]{3}\d+$/, "mlItemId inválido");
const money = z.number().min(0).max(MAX_MONEY);
const percent = z.number().min(0).max(1000);

/**
 * O imposto do anúncio (30 dias do Tributário) pode ser negativo: em Lucro
 * Real, um produto com ICMS-ST vendido para fora do estado tem crédito da
 * compra + ST recuperável maiores que o débito da venda. A Lucratividade e as
 * Ações do dia já usam o número assim; aqui ele só volta do navegador.
 */
const taxRatePercent = z.number().min(-100).max(100);

export const pricingInputsSchema = z.object({
  productCost: money.nullable(),
  extraCosts: money.nullable(),
  taxRatePercent: taxRatePercent.nullable(),
  mlFeeRebate: money.nullable(),
  listingTypeId: z.string().max(40).nullable(),
  listingTypeLabel: z.string().max(80).nullable(),
  adsMetricsAvailable: z.boolean(),
  tacosPercent: percent.nullable(),
  adsCost: z.number().min(0).max(MAX_MONEY * 10).nullable(),
  adsUnitsSold: z.number().min(0).max(MAX_MONEY).nullable(),
});

const blocked = z.enum(["missing_cost", "missing_tax", "kit_incomplete", "incomplete"]).nullable();

/** O que a conta precisa do anúncio além do item (lido de novo a cada pedido). */
const listingContext = {
  mlItemId,
  inputs: pricingInputsSchema,
  salePrice: z.number().positive().max(MAX_MONEY),
  regularPrice: z.number().positive().max(MAX_MONEY).nullable(),
  pmaPrice: z.number().positive().max(MAX_MONEY).nullable(),
  targetPercent: z.number().min(ROTINA_MARGIN_LIMITS.min).max(ROTINA_MARGIN_LIMITS.max),
  blocked,
  /** Quando os insumos foram lidos (ISO), para a nota do simulador. */
  readAt: z.iso.datetime(),
};

export const calculatorReadSchema = z.object({ mlItemId });

export const calculatorAdsSchema = z.object({
  mlItemId,
  basis: z.literal("7d"),
});

export const calculatorSimulateSchema = z.object({
  ...listingContext,
  prices: z.array(z.number().positive().max(MAX_MONEY)).min(1).max(5),
  listingTypeId: z.enum(SIMULATABLE_LISTING_TYPES).optional(),
});

export const calculatorFloorSchema = z.object({
  ...listingContext,
  listingTypeId: z.enum(SIMULATABLE_LISTING_TYPES).optional(),
});

export type CalculatorSimulateBody = z.infer<typeof calculatorSimulateSchema>;
export type CalculatorFloorBody = z.infer<typeof calculatorFloorSchema>;
