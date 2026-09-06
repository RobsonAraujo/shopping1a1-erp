import { prisma } from "@/lib/db/db";
import {
  fetchUnitsSoldForItemsInWindowBatched,
  type SalesWindowDateField,
} from "@/lib/mercadolibre/api";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";

/**
 * TTL curto de propósito — a janela de vendas é rolante (sempre termina
 * "agora", não um mês fechado), então o cache não pode viver muito sem
 * divergir da realidade. 20min é suficiente pra cobrir "abrir Estoque,
 * depois Compras, depois Operações Full na mesma sessão" sem repetir a
 * varredura de vendas por item no Mercado Livre a cada uma dessas telas.
 */
const SALES_WINDOW_CACHE_TTL_MS = 20 * 60 * 1000;

const WRITE_CONCURRENCY = 10;

/**
 * Mesmo contrato de `fetchUnitsSoldForItemsInWindowBatched`, mas com um
 * cache em banco (TTL curto) na frente — evita repetir a mesma varredura
 * ML "unidades vendidas por item" entre Estoque, Compras e Operações Full
 * quando essas telas são abertas na mesma sessão. Itens fora do cache (ou
 * com snapshot expirado) são buscados ao vivo e o resultado é gravado pra
 * a próxima leitura.
 */
export async function fetchUnitsSoldForItemsInWindowCached(
  organizationId: string,
  accessToken: string,
  sellerId: number,
  itemIds: string[],
  windowDays: number,
  dateField: SalesWindowDateField,
): Promise<Record<string, number>> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (uniqueIds.length === 0 || windowDays <= 0) return {};

  const cutoff = new Date(Date.now() - SALES_WINDOW_CACHE_TTL_MS);
  const cached = await prisma.salesWindowSnapshot.findMany({
    where: {
      organizationId,
      mlItemId: { in: uniqueIds },
      windowDays,
      dateField,
      computedAt: { gte: cutoff },
    },
    select: { mlItemId: true, unitsSold: true },
  });

  const result: Record<string, number> = {};
  for (const row of cached) {
    result[row.mlItemId] = row.unitsSold;
  }

  const missingIds = uniqueIds.filter((id) => !(id in result));
  if (missingIds.length === 0) return result;

  const fresh = await fetchUnitsSoldForItemsInWindowBatched(
    accessToken,
    sellerId,
    missingIds,
    windowDays,
    dateField,
  );
  Object.assign(result, fresh);

  const computedAt = new Date();
  await mapWithConcurrency(Object.entries(fresh), WRITE_CONCURRENCY, ([mlItemId, unitsSold]) =>
    prisma.salesWindowSnapshot.upsert({
      where: {
        organizationId_mlItemId_windowDays_dateField: {
          organizationId,
          mlItemId,
          windowDays,
          dateField,
        },
      },
      create: { organizationId, mlItemId, windowDays, dateField, unitsSold, computedAt },
      update: { unitsSold, computedAt },
    }),
  );

  return result;
}
