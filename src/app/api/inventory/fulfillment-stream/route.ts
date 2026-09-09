import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enrichItemsWithFulfillmentStock,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import { fetchUnitsSoldForItemsInWindowCached } from "@/lib/mercadolibre/sales-window-cache";
import {
  computeFulfillmentDerivedFields,
  type FulfillmentDerivedFields,
} from "@/lib/inventory/fulfillment-row-fields";
import type { ItemFulfillmentStock } from "@/lib/mercadolibre/fulfillment-stock";
import {
  loadOperationalSettings,
  toStockPlanningValues,
} from "@/lib/configuracoes/operational-settings";
import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

export const maxDuration = 300;

const bodySchema = z.object({
  mlItemIds: z.array(z.string().trim().min(1)).min(1).max(5000),
});

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

type RowEvent = { type: "row"; mlItemId: string } & FulfillmentDerivedFields;

/**
 * Preenche as colunas derivadas do estoque Full ("A caminho", "Total",
 * badge "Comprar") aos poucos, item por item — em vez de fazer o Estoque
 * inteiro esperar a varredura Full completa (1 chamada ML por item Full)
 * antes de mostrar a tabela. O client (`InventoryStockTable`) já renderiza
 * a linha com o resto dos dados; essas colunas ficam borradas até o evento
 * daquele item chegar aqui.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { mlItemIds } = parsedBody.data;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const operationalSettings = await loadOperationalSettings(organizationId);
        const stockPlanning = toStockPlanningValues(operationalSettings);

        const [items, warehouseStocks, soldByItem] = await Promise.all([
          fetchItemsByIdsBatched(token, mlItemIds),
          prisma.warehouseStock.findMany({
            where: { organizationId, mlItemId: { in: mlItemIds } },
            select: { mlItemId: true, quantity: true, purchaseLeadTimeDays: true },
          }),
          fetchUnitsSoldForItemsInWindowCached(
            organizationId,
            token,
            userId,
            mlItemIds,
            stockPlanning.salesAverageWindowDays,
            stockPlanning.salesWindowDateField,
          ),
        ]);

        const warehouseById = new Map(
          warehouseStocks.map((s) => [
            s.mlItemId,
            { quantity: s.quantity, purchaseLeadTimeDays: s.purchaseLeadTimeDays },
          ]),
        );
        const itemById = new Map(items.map((item) => [item.id, item]));

        function sendRow(
          itemId: string,
          fulfillment: ItemFulfillmentStock | undefined,
        ) {
          const item = itemById.get(itemId);
          if (!item) return;
          const warehouse = warehouseById.get(itemId);
          const fields = computeFulfillmentDerivedFields(
            item,
            fulfillment,
            warehouse?.quantity ?? 0,
            warehouse?.purchaseLeadTimeDays ?? null,
            soldByItem[itemId] ?? 0,
            stockPlanning,
          );
          const event: RowEvent = { type: "row", mlItemId: itemId, ...fields };
          controller.enqueue(encoder.encode(sseLine(event)));
        }

        const resolvedByItem = await enrichItemsWithFulfillmentStock(
          token,
          items,
          (itemId, fulfillment) => sendRow(itemId, fulfillment),
        );

        // Itens que o cliente marcou como "Full" no primeiro render mas que
        // `enrichItemsWithFulfillmentStock` não reconheceu como tal agora
        // (status mudou entre o load da página e esta chamada, por exemplo)
        // nunca disparam o callback acima — sem isso, a linha ficaria
        // borrada pra sempre. Resolve como "sem estoque Full em trânsito".
        for (const item of items) {
          if (!resolvedByItem.has(item.id)) sendRow(item.id, undefined);
        }

        controller.enqueue(encoder.encode(sseLine({ type: "complete" })));
      } catch (e) {
        logServerError("api/inventory/fulfillment-stream POST", e);
        const message = e instanceof Error ? e.message : "fulfillment_stream_failed";
        controller.enqueue(encoder.encode(sseLine({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
