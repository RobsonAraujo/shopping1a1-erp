import type { StockPlanningValues } from "@/config/stock-planning";
import { isFulfillmentListing } from "@/lib/mercadolibre/fulfillment-stock";
import type { ItemFulfillmentStock } from "@/lib/mercadolibre/fulfillment-stock";
import { mlAvailableStockUnits } from "@/lib/mercadolibre/ml-available-stock";
import { computeStockPlanningDisplay } from "@/lib/compras/stock-planning";
import type { ItemBody } from "@/lib/mercadolibre/types";

export function stockUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export type FulfillmentDerivedFields = {
  mlStock: number;
  isFulfillment: boolean;
  mlProcessTransfer: number;
  mlProcessInternal: number;
  mlStockOnTheWay: number;
  needsPurchaseAttention: boolean;
};

/**
 * Campos de uma linha do Estoque que dependem do estoque Full em
 * processamento (`enrichItemsWithFulfillmentStock`) — extraído de
 * `computeUpdatedRowFields` (rota PATCH de estoque) pra ser reusado também
 * pela rota de streaming que preenche essas colunas aos poucos depois do
 * primeiro render (ver `/api/inventory/fulfillment-stream`).
 */
export function computeFulfillmentDerivedFields(
  item: ItemBody,
  fulfillment: ItemFulfillmentStock | undefined,
  warehouseQuantity: number,
  purchaseLeadTimeDays: number | null,
  sold: number,
  stockPlanning: StockPlanningValues,
): FulfillmentDerivedFields {
  const mlStock = mlAvailableStockUnits(item);
  const isFulfillment = isFulfillmentListing(item);
  const mlProcessTransfer = stockUnits(fulfillment?.inTransfer);
  const mlProcessInternal = stockUnits(fulfillment?.internalProcess);
  const mlStockOnTheWay = isFulfillment ? stockUnits(fulfillment?.inProcess) : 0;

  const plan = computeStockPlanningDisplay(
    mlStock + warehouseQuantity + mlStockOnTheWay,
    sold,
    stockPlanning.salesAverageWindowDays,
    stockPlanning,
    purchaseLeadTimeDays ?? 0,
  );

  return {
    mlStock,
    isFulfillment,
    mlProcessTransfer,
    mlProcessInternal,
    mlStockOnTheWay,
    needsPurchaseAttention: plan.needsPurchaseAttention,
  };
}
