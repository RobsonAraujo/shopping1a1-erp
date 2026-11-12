import {
  logisticLabel,
  logisticRank,
  type CatalogCompetitionSummary,
  type CatalogCompetitorOffer,
} from "@/lib/catalog-report/catalog-competitors";
import { roundMoney } from "@/lib/pricing/financial-margin";
import type { CatalogLiveStatus, RotinaFloorBand } from "@/lib/rotina/types";

/**
 * "Subir preço no catálogo": quanto um catálogo que está ganhando pode subir.
 * Puro. É uma **estimativa** — o ML não publica como pesa preço × entrega ×
 * reputação. O modelo vem dos snapshots reais (`price_to_win`):
 *
 * - preço igual ao do vencedor, com condições parecidas → **divide** o 1º lugar;
 * - para tomar a vitrine, o ML pede ~1–3% abaixo de quem ganha.
 *
 * Então, com C = concorrente mais barato (de outro vendedor):
 * - dividir ≈ C;
 * - ganhar sozinho ≈ C × (1 − folga).
 *
 * Conservador de propósito: não dá crédito pelo seu Full contra quem não é
 * Full. Se alguém perto do mais barato tem entrega **melhor** que a sua, avisa
 * (a folga real pode ser menor). Se o teto cair numa faixa conhecida em que o
 * frete passa a ser seu (`floor.bands`), fica logo abaixo dela.
 *
 * O ML pesa coisas que a lista de ofertas não mostra (entrega no mesmo dia,
 * reputação): no probe de 2026-11-12, um Full a R$ 53,82 ganhava de ofertas a
 * R$ 51,65 e R$ 53, e o ML pedia 12,5% abaixo dele para tomar a vitrine. Por
 * isso o número é estimativa e a tela pede para conferir depois.
 */

export type CatalogRaiseEstimate = {
  currentPrice: number;
  /** Nenhum outro vendedor no produto: não há teto pela concorrência. */
  alone: boolean;
  competitorCount: number;
  cheapest: CatalogCompetitorOffer | null;
  cheapestLogisticLabel: string | null;
  /** Teto estimado para seguir ganhando sozinho (já abaixo de faixa proibida). */
  winCeiling: number | null;
  /** Preço em que provavelmente passa a dividir o 1º lugar (≈ o mais barato). */
  shareCeiling: number | null;
  gainPerUnit: number | null;
  gainPercent: number | null;
  /** O teto caiu numa faixa em que o frete passa a ser seu: ficou logo abaixo dela. */
  belowBand: boolean;
  /** Concorrente perto do mais barato com entrega melhor que a sua. */
  betterLogistics: { price: number; label: string | null } | null;
  /**
   * Seu outro anúncio no mesmo produto, num preço entre o de hoje e o teto:
   * passando dele, a vitrine tende a ir para ele (no preço dele).
   */
  ownOther: { itemId: string; price: number } | null;
  fetchedAt: string;
};

/** Concorrente até esta % acima do mais barato conta para o aviso de entrega melhor. */
const NEAR_CHEAPEST_PERCENT = 10;

export function estimateCatalogRaise(args: {
  status: CatalogLiveStatus | null;
  sellerPrice: number | null;
  competition: CatalogCompetitionSummary | null;
  now: Date;
  cushionPercent: number;
  maxAgeMs: number;
  bands?: readonly RotinaFloorBand[];
}): CatalogRaiseEstimate | null {
  const { competition, sellerPrice } = args;
  if (args.status !== "winning" || sellerPrice === null || sellerPrice <= 0) return null;
  if (!competition) return null;
  const age = args.now.getTime() - new Date(competition.fetchedAt).getTime();
  if (!Number.isFinite(age) || age > args.maxAgeMs) return null;

  const cheapest = competition.top[0] ?? null;
  const ownOtherFor = (ceiling: number | null) => {
    const own = competition.ownOther;
    if (!own || own.price < sellerPrice) return null;
    if (ceiling !== null && own.price >= ceiling) return null;
    return { itemId: own.itemId, price: own.price };
  };
  const base = {
    currentPrice: sellerPrice,
    competitorCount: competition.competitorCount,
    fetchedAt: competition.fetchedAt,
  };

  if (competition.competitorCount === 0 || !cheapest) {
    return {
      ...base,
      alone: true,
      cheapest: null,
      cheapestLogisticLabel: null,
      winCeiling: null,
      shareCeiling: null,
      gainPerUnit: null,
      gainPercent: null,
      belowBand: false,
      betterLogistics: null,
      ownOther: ownOtherFor(null),
    };
  }

  // Centavos para baixo: o teto nunca passa da conta (o 1e-6 absorve o erro de
  // ponto flutuante: 41 × 0,97 dá 39,7699…).
  let winCeiling =
    Math.floor(cheapest.price * (1 - args.cushionPercent / 100) * 100 + 1e-6) / 100;
  let belowBand = false;
  const band = args.bands?.find(
    (candidate) => winCeiling >= candidate.from && winCeiling <= candidate.to,
  );
  if (band) {
    winCeiling = roundMoney(band.from - 0.01);
    belowBand = true;
  }

  // Sem saber a sua logística, não dá para dizer que a do outro é melhor.
  const myRank = logisticRank(competition.myLogisticType);
  const better =
    myRank === 0
      ? undefined
      : competition.top.find(
          (offer) =>
            logisticRank(offer.logisticType) > myRank &&
            offer.price <= cheapest.price * (1 + NEAR_CHEAPEST_PERCENT / 100),
        );

  const gainPerUnit = roundMoney(winCeiling - sellerPrice);
  return {
    ...base,
    alone: false,
    cheapest,
    cheapestLogisticLabel: logisticLabel(cheapest.logisticType),
    winCeiling,
    shareCeiling: cheapest.price,
    gainPerUnit,
    gainPercent: roundMoney((gainPerUnit / sellerPrice) * 100),
    belowBand,
    betterLogistics: better
      ? { price: better.price, label: logisticLabel(better.logisticType) }
      : null,
    ownOther: ownOtherFor(winCeiling),
  };
}

/**
 * Vira tarefa? Com concorrente, só se a alta estimada passar do mínimo. Sozinho
 * no produto, sempre — mas sem número (o card diz que não há teto pela
 * concorrência).
 */
export function catalogRaiseQualifies(
  estimate: CatalogRaiseEstimate | null,
  minPercent: number,
): boolean {
  if (!estimate) return false;
  if (estimate.alone) return true;
  return (
    estimate.gainPercent !== null &&
    estimate.gainPerUnit !== null &&
    estimate.gainPerUnit > 0 &&
    estimate.gainPercent >= minPercent
  );
}
