import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  streamOperationsBoardResync,
  type OperationsCardSalesPatch,
  type SingleBoardData,
} from "@/lib/compras/replenishment-cycle-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";

export const maxDuration = 300;

const bodySchema = z.object({
  kind: z.enum(["purchase", "full"]),
});

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

type CardPatchEvent = { type: "card-patch"; mlItemId: string } & OperationsCardSalesPatch;
type DoneEvent = { type: "done" } & SingleBoardData;
type ErrorEvent = { type: "error"; message: string };
export type ResyncStreamEvent = CardPatchEvent | DoneEvent | ErrorEvent;

/**
 * Contraparte em background de `loadOperationsBoardsFast` — o board já
 * pintou com o que estava no banco (algum campo borrado, `salesPending`);
 * esta rota roda o pipeline pesado de sempre (varredura de vendas no
 * Mercado Livre + sync de criação/auto-complete de ciclo) e vai emitindo um
 * `card-patch` por item assim que a venda dele resolve, sem esperar o
 * catálogo inteiro. Fecha com `done` (lista final de cards daquele board,
 * já refletindo ciclo novo/auto-completado) ou `error`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { kind } = parsedBody.data;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      function send(event: ResyncStreamEvent) {
        controller.enqueue(encoder.encode(sseLine(event)));
      }
      try {
        const board = await streamOperationsBoardResync(
          token,
          userId,
          organizationId,
          kind,
          (mlItemId, patch) => send({ type: "card-patch", mlItemId, ...patch }),
        );
        send({ type: "done", ...board });
      } catch (e) {
        logServerError("api/replenishment-cycles/resync-stream POST", e);
        const message = e instanceof Error ? e.message : "resync_stream_failed";
        send({ type: "error", message });
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
