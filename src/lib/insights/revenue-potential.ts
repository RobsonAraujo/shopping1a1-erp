/**
 * Estimativa de "potencial de faturamento": quanto o catálogo faturaria por
 * mês se nenhum produto furasse estoque, incluindo produtos pausados.
 *
 * A média diária é ancorada na última venda real de cada produto (não no
 * calendário corrido a partir de hoje): buscamos os pedidos reais dos
 * últimos LOOKBACK_DAYS dias, achamos o dia da última venda de cada item, e
 * usamos os ANCHOR_WINDOW_DAYS dias anteriores a essa venda para calcular a
 * média. Isso evita diluir a média com dias recentes de ruptura (estoque
 * zerado) — sejam eles de um produto ainda "ativo" que furou estoque, ou de
 * um produto pausado (o Mercado Livre pausa automaticamente quando o
 * estoque zera, então a última venda real marca bem o fim do período em
 * que o produto vendia normalmente).
 */
import { stockPlanningConfig } from "@/config/stock-planning";
import {
  fetchOperationalListingIds,
  fetchItemsByIdsBatched,
  fetchDailyUnitsSoldByItemInDateRange,
} from "@/lib/mercadolibre/api";
import { getItemSku, isKitItem } from "@/lib/mercadolibre/item-sku";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { loadStockReportProductsByMlItemId } from "@/lib/products/product-data";
import { loadSupplierNamesByMlItemId } from "@/lib/products/product-resolver";
import type { RevenuePotentialRow } from "@/lib/insights/types";

const LOOKBACK_DAYS = 120;
const ANCHOR_WINDOW_DAYS = 14;
const RECENT_SALE_THRESHOLD_DAYS = 7;
const DAYS_IN_MONTH = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function loadRevenuePotentialData(
  token: string,
  userId: number,
  organizationId: string,
) {
  const dateField = stockPlanningConfig.salesWindowDateField;
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - LOOKBACK_DAYS * MS_PER_DAY);

  const allIds = await fetchOperationalListingIds(token, userId, organizationId);

  const [rawItems, dailyByItem] = await Promise.all([
    fetchItemsByIdsBatched(token, allIds),
    fetchDailyUnitsSoldByItemInDateRange(
      token,
      userId,
      lookbackStart,
      now,
      dateField,
    ),
  ]);
  const items = rawItems.filter((item) => !isKitItem(item));

  const todayKey = dayKey(now);

  const productsByMlItemId = await loadStockReportProductsByMlItemId(
    organizationId,
    items.map((item) => item.id),
  );
  const supplierNames = await loadSupplierNamesByMlItemId(
    organizationId,
    items.map((item) => item.id),
  );

  const rows: RevenuePotentialRow[] = items.map((item) => {
    const sku = getItemSku(item);
    const costInfo = productsByMlItemId.get(item.id);
    const unitCost = costInfo?.unitCost ?? null;
    const hasIcmsSt = costInfo?.hasIcmsSt ?? false;
    const byDay = dailyByItem[item.id] ?? {};
    const soldDays = Object.keys(byDay).sort();
    const supplierName = supplierNames.get(item.id) ?? null;

    if (soldDays.length === 0) {
      return {
        mlItemId: item.id,
        title: item.title,
        sku,
        status: item.status,
        imageUrl: bestItemImageUrl(item) ?? null,
        price: item.price,
        dailyAvgEstimate: 0,
        potentialMonthlyRevenue: 0,
        currentMonthlyRevenue: 0,
        gap: 0,
        estimateBasis: "historical",
        unitCost,
        hasIcmsSt,
        supplierName,
      };
    }

    const lastSaleKey = soldDays[soldDays.length - 1];
    const lastSaleDate = new Date(`${lastSaleKey}T00:00:00.000Z`);
    const windowStart = new Date(
      lastSaleDate.getTime() - (ANCHOR_WINDOW_DAYS - 1) * MS_PER_DAY,
    );

    let unitsInWindow = 0;
    for (const [key, qty] of Object.entries(byDay)) {
      const d = new Date(`${key}T00:00:00.000Z`);
      if (d >= windowStart && d <= lastSaleDate) {
        unitsInWindow += qty;
      }
    }

    const dailyAvgEstimate = unitsInWindow / ANCHOR_WINDOW_DAYS;
    const potentialMonthlyRevenue = dailyAvgEstimate * DAYS_IN_MONTH * item.price;

    const daysSinceLastSale = Math.round(
      (new Date(`${todayKey}T00:00:00.000Z`).getTime() - lastSaleDate.getTime()) /
        MS_PER_DAY,
    );
    const isCurrentlySelling =
      item.status === "active" && daysSinceLastSale <= RECENT_SALE_THRESHOLD_DAYS;

    const currentMonthlyRevenue = isCurrentlySelling ? potentialMonthlyRevenue : 0;

    return {
      mlItemId: item.id,
      title: item.title,
      sku,
      status: item.status,
      imageUrl: bestItemImageUrl(item) ?? null,
      price: item.price,
      dailyAvgEstimate,
      potentialMonthlyRevenue,
      currentMonthlyRevenue,
      gap: potentialMonthlyRevenue - currentMonthlyRevenue,
      estimateBasis: isCurrentlySelling ? "recent" : "historical",
      unitCost,
      hasIcmsSt,
      supplierName,
    };
  });

  rows.sort((a, b) => b.gap - a.gap);

  const totalPotential = rows.reduce((sum, r) => sum + r.potentialMonthlyRevenue, 0);
  const totalCurrent = rows.reduce((sum, r) => sum + r.currentMonthlyRevenue, 0);
  const totalGap = totalPotential - totalCurrent;

  return { rows, totalPotential, totalCurrent, totalGap };
}
