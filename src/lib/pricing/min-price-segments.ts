import {
  computeMinSalePriceForTargetMargin,
  roundMoney,
  type MinSalePriceInput,
  type MinSalePriceReason,
} from "@/lib/pricing/financial-margin";
import {
  marginPercentAtPrice,
  type MarginAtPriceParams,
  type MlCostsAtPrice,
} from "@/lib/pricing/refine-min-sale-price";

/**
 * Menor preço que sustenta a margem-alvo, **ciente das faixas de frete**.
 *
 * A busca binária de `refineMinSalePriceForTargetMargin` (Lucratividade) supõe
 * que a margem só sobe com o preço. Isso quebra no limiar do frete grátis: abaixo
 * dele (~R$ 79 no MLB) o frete deixa de ser do vendedor, então a margem a R$ 78
 * pode ser MAIOR que a R$ 81. Resultado prático: um "mínimo" de R$ 76 com a
 * faixa R$ 79–84 inválida no meio — quem cria promoção a R$ 80 achando que está
 * acima do mínimo fica abaixo da meta.
 *
 * Aqui o intervalo de busca é dividido em **segmentos de frete constante**
 * (o limiar sai das próprias cotações — nada de R$ 79 fixo no código). Dentro de
 * um segmento a margem é monotônica, então cada um resolve por bisseção. O
 * resultado é o menor preço válido de todos e as **faixas proibidas** acima dele.
 *
 * Função pura: as cotações (`quote`) são injetadas — o caller real consulta o ML
 * (`src/lib/rotina/floors.ts`), os testes usam uma tabela.
 */

export type PriceQuoteFn = (price: number) => Promise<MlCostsAtPrice | null>;

/** Frete só (sem taxa) — mais barato para achar o limiar. Opcional. */
export type ShippingQuoteFn = (price: number) => Promise<number | null>;

export type MinPriceBand = { from: number; to: number };

export type SegmentedMinPriceResult = {
  minSalePrice: number | null;
  reason: MinSalePriceReason;
  /** `false` = ficou na estimativa por fórmula (alguma cotação falhou). */
  refined: boolean;
  /** Faixas acima do mínimo onde a meta NÃO se sustenta. */
  bands: MinPriceBand[];
};

const PRICE_STEP = 0.01;
const MAX_MARGIN_ITERATIONS = 10;
const MAX_HIGH_EXPANSIONS = 4;
/** Quantos limiares de frete no máximo (o MLB hoje tem um). */
const MAX_SEGMENT_SPLITS = 3;

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

type Segment = { from: number; to: number };

async function splitByShipping(
  from: number,
  to: number,
  shippingAt: ShippingQuoteFn,
  depth: number,
): Promise<Segment[] | null> {
  const shippingFrom = await shippingAt(from);
  const shippingTo = await shippingAt(to);
  if (shippingFrom === null || shippingTo === null) return null;
  if (sameMoney(shippingFrom, shippingTo) || depth >= MAX_SEGMENT_SPLITS) {
    return [{ from, to }];
  }

  // `lo` tem o frete de `from`; `hi`, outro. Converge no limiar em centavos.
  let lo = from;
  let hi = to;
  while (roundMoney(hi - lo) > PRICE_STEP) {
    const mid = roundMoney((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    const shippingMid = await shippingAt(mid);
    if (shippingMid === null) return null;
    if (sameMoney(shippingMid, shippingFrom)) lo = mid;
    else hi = mid;
  }

  const rest = await splitByShipping(hi, to, shippingAt, depth + 1);
  if (!rest) return null;
  return [{ from, to: lo }, ...rest];
}

/** Menor preço em [from, to] com margem ≥ alvo, sabendo que `to` atinge e `from` não. */
async function bisectMargin(
  from: number,
  to: number,
  target: number,
  marginAt: (price: number) => Promise<number | null>,
): Promise<number | null> {
  let lo = from;
  let hi = to;
  for (let i = 0; i < MAX_MARGIN_ITERATIONS; i++) {
    if (roundMoney(hi - lo) <= PRICE_STEP) break;
    const mid = roundMoney((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    const margin = await marginAt(mid);
    if (margin === null) return null;
    if (margin >= target) hi = mid;
    else lo = mid;
  }
  return roundMoney(hi);
}

function pushBand(bands: MinPriceBand[], from: number, to: number) {
  if (to < from) return;
  const last = bands[bands.length - 1];
  if (last && roundMoney(from - last.to) <= PRICE_STEP) {
    last.to = to;
    return;
  }
  bands.push({ from, to });
}

export async function findMinSalePriceBySegments(
  input: MinSalePriceInput,
  marginParams: MarginAtPriceParams,
  quote: PriceQuoteFn,
  shippingQuote?: ShippingQuoteFn,
): Promise<SegmentedMinPriceResult> {
  const estimate = computeMinSalePriceForTargetMargin(input);
  if (estimate.reason !== "ok" || estimate.minSalePrice === null) {
    return {
      minSalePrice: estimate.minSalePrice,
      reason: estimate.reason,
      refined: false,
      bands: [],
    };
  }

  const fallback: SegmentedMinPriceResult = {
    minSalePrice: estimate.minSalePrice,
    reason: "ok",
    refined: false,
    bands: [],
  };
  const target = input.targetMarginPercent;

  const marginAt = async (price: number): Promise<number | null> => {
    const costs = await quote(price);
    if (!costs) return null;
    return marginPercentAtPrice(
      price,
      costs.mlFeeAmount,
      costs.shippingCost,
      marginParams,
    );
  };
  const shippingAt: ShippingQuoteFn =
    shippingQuote ?? (async (price) => (await quote(price))?.shippingCost ?? null);

  const low = roundMoney(
    Math.max(PRICE_STEP, marginParams.productCost + marginParams.extraCosts),
  );

  // `high` precisa ser um preço que atinge a meta: o de hoje (se já atinge) ou
  // a estimativa com folga, ampliada até atingir.
  let high = roundMoney(
    estimate.alreadyMeetsTarget
      ? input.salePrice
      : Math.max(input.salePrice, estimate.minSalePrice * 1.25),
  );
  let marginHigh = await marginAt(high);
  let expansions = 0;
  while (
    (marginHigh === null || marginHigh < target) &&
    expansions < MAX_HIGH_EXPANSIONS
  ) {
    high = roundMoney(high * 1.35);
    marginHigh = await marginAt(high);
    expansions += 1;
  }
  if (marginHigh === null || marginHigh < target) return fallback;
  if (high <= low) {
    return { minSalePrice: high, reason: "ok", refined: true, bands: [] };
  }

  const segments = await splitByShipping(low, high, shippingAt, 0);
  if (!segments) return fallback;

  const perSegment: Array<Segment & { minValid: number | null }> = [];
  for (const segment of segments) {
    const marginEnd = await marginAt(segment.to);
    if (marginEnd === null) return fallback;
    if (marginEnd < target) {
      perSegment.push({ ...segment, minValid: null });
      continue;
    }
    const marginStart = await marginAt(segment.from);
    if (marginStart === null) return fallback;
    if (marginStart >= target) {
      perSegment.push({ ...segment, minValid: segment.from });
      continue;
    }
    const found = await bisectMargin(segment.from, segment.to, target, marginAt);
    if (found === null) return fallback;
    perSegment.push({ ...segment, minValid: found });
  }

  const firstValid = perSegment.findIndex((segment) => segment.minValid !== null);
  if (firstValid === -1) return fallback;

  const bands: MinPriceBand[] = [];
  for (let i = firstValid + 1; i < perSegment.length; i++) {
    const segment = perSegment[i];
    if (segment.minValid === null) {
      pushBand(bands, segment.from, segment.to);
    } else if (segment.minValid > segment.from) {
      pushBand(bands, segment.from, roundMoney(segment.minValid - PRICE_STEP));
    }
  }

  return {
    minSalePrice: perSegment[firstValid].minValid,
    reason: "ok",
    refined: true,
    bands,
  };
}
