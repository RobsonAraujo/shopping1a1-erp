import { prisma } from "@/lib/db/db";
import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  fetchPaidOrdersByPeriod,
  paidOrderLinesFromOrders,
} from "@/lib/mercadolibre/api";
import { parseSnapshotPayload } from "@/lib/dre/dre-month-data";
import { getCalendarMonthRange } from "@/lib/mercadolibre/revenue-periods";
import {
  avaliarProximidadeLimite,
  calcularAliquotaEfetivaNominal,
  encontrarFaixaPorRbt12,
} from "@/lib/simples-nacional/das-calculator";
import type { Rbt12MonthRevenue, Rbt12Result } from "@/lib/simples-nacional/types";

function previousYearMonth(year: number, month: number, offset: number) {
  const total = year * 12 + (month - 1) - offset;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function decimalToNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Calcula a receita do mês do zero — `DreMonthSnapshot` já sincronizado primeiro, senão busca ao vivo no ML. */
async function computeMonthRevenue(
  organizationId: string,
  sellerId: number,
  accessToken: string,
  year: number,
  month: number,
): Promise<{ revenue: number; source: "dre_snapshot" | "ml_live" }> {
  const snapshot = await prisma.dreMonthSnapshot.findUnique({
    where: { organizationId_year_month: { organizationId, year, month } },
    select: { payload: true },
  });
  const parsed = snapshot ? parseSnapshotPayload(snapshot.payload) : null;
  if (parsed) {
    return { revenue: parsed.revenueMl, source: "dre_snapshot" };
  }

  const { from, to } = getCalendarMonthRange(year, month);
  const orders = await fetchPaidOrdersByPeriod(accessToken, sellerId, from, to);
  const lines = paidOrderLinesFromOrders(orders);
  const revenue = roundMoney(lines.reduce((sum, line) => sum + line.revenue, 0));
  return { revenue, source: "ml_live" };
}

/**
 * Receita de um mês pro RBT12, com cache persistente
 * (`SimplesRevenueMonthSnapshot`). Mês fechado é imutável na prática — uma
 * vez calculado, não recomputa em toda visita (evita repetir até 12
 * chamadas ao ML por acesso à tela). `forceRefresh` (botão "Atualizar" na
 * UI) ignora o cache e recalcula.
 */
async function loadMonthRevenue(
  organizationId: string,
  sellerId: number,
  accessToken: string,
  year: number,
  month: number,
  forceRefresh: boolean,
): Promise<Rbt12MonthRevenue> {
  if (!forceRefresh) {
    const cached = await prisma.simplesRevenueMonthSnapshot.findUnique({
      where: {
        organizationId_sellerId_year_month: { organizationId, sellerId, year, month },
      },
    });
    if (cached) {
      return {
        year,
        month,
        revenue: decimalToNumber(cached.revenue),
        source: "cache",
        computedAt: cached.computedAt.toISOString(),
      };
    }
  }

  const { revenue, source } = await computeMonthRevenue(
    organizationId,
    sellerId,
    accessToken,
    year,
    month,
  );
  const computedAt = new Date();
  await prisma.simplesRevenueMonthSnapshot.upsert({
    where: {
      organizationId_sellerId_year_month: { organizationId, sellerId, year, month },
    },
    create: { organizationId, sellerId, year, month, revenue, source, computedAt },
    update: { revenue, source, computedAt },
  });

  return { year, month, revenue, source, computedAt: computedAt.toISOString() };
}

/**
 * RBT12 (receita bruta acumulada nos 12 meses anteriores ao mês de
 * referência, definição legal do Simples Nacional — não inclui o mês
 * corrente). Cada mês é lido do cache quando existe (rápido, zero chamada ao
 * ML); só computa (e grava no cache) os meses ainda não vistos. Passe
 * `forceRefresh: true` (botão "Atualizar") pra ignorar o cache e recalcular
 * os 12 meses.
 */
export async function loadRbt12(
  organizationId: string,
  sellerId: number,
  accessToken: string,
  referenceYear: number,
  referenceMonth: number,
  forceRefresh = false,
): Promise<Rbt12Result> {
  const monthOffsets = Array.from({ length: 12 }, (_, i) => i + 1);
  const months = await Promise.all(
    monthOffsets.map((offset) => {
      const { year, month } = previousYearMonth(
        referenceYear,
        referenceMonth,
        offset,
      );
      return loadMonthRevenue(
        organizationId,
        sellerId,
        accessToken,
        year,
        month,
        forceRefresh,
      );
    }),
  );
  months.sort((a, b) => a.year - b.year || a.month - b.month);

  const rbt12Total = roundMoney(
    months.reduce((sum, m) => sum + m.revenue, 0),
  );
  const faixa = encontrarFaixaPorRbt12(rbt12Total);
  const oldestComputedAt = months.reduce(
    (oldest, m) => (m.computedAt < oldest ? m.computedAt : oldest),
    months[0].computedAt,
  );

  return {
    referenceYear,
    referenceMonth,
    rbt12Total,
    months,
    faixa,
    aliquotaEfetivaNominal: calcularAliquotaEfetivaNominal(rbt12Total, faixa),
    proximidadeLimite: avaliarProximidadeLimite(rbt12Total),
    oldestComputedAt,
  };
}
