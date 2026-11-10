import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { logServerError } from "@/lib/infra/server-public-error";
import { listingBelongsToOrganization } from "@/lib/rotina/listing-targets";
import type { RotinaRefreshStreamEvent } from "@/lib/rotina/refresh-events";
import { RotinaRefreshBusyError, runRotinaRefresh } from "@/lib/rotina/refresh";

export const maxDuration = 300;

const bodySchema = z.object({
  /** Recalcular só estes anúncios (chip "recalcular"). Vazio = rodada completa. */
  itemIds: z
    .array(z.string().regex(/^[A-Z]{3}\d+$/, "mlItemId inválido"))
    .max(50)
    .optional(),
});

function sseLine(data: RotinaRefreshStreamEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * "Atualizar" da Rotina. Streaming (SSE) porque a rodada leva minutos: o
 * overlay mostra etapa e progresso. Fecha com `done` (`status: "partial"` =
 * orçamento de tempo acabou, chame de novo) ou `error`.
 *
 * Se o client desconectar, a rodada para no fim do lote atual e fica
 * retomável — o que já foi calculado está gravado.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const itemIds = parsedBody.data.itemIds ?? [];

  if (itemIds.length > 0) {
    const owned = await Promise.all(
      itemIds.map((id) => listingBelongsToOrganization(organizationId, id)),
    );
    if (owned.some((ok) => !ok)) {
      return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
    }
  }

  const encoder = new TextEncoder();
  let closed = false;
  const readable = new ReadableStream({
    async start(controller) {
      function send(event: RotinaRefreshStreamEvent) {
        if (closed) return;
        controller.enqueue(encoder.encode(sseLine(event)));
      }
      try {
        const result = await runRotinaRefresh(organizationId, {
          token,
          userId,
          itemIds,
          signal: request.signal,
          onEvent: send,
        });
        send({ type: "done", ...result });
      } catch (e) {
        if (e instanceof RotinaRefreshBusyError) {
          send({ type: "error", message: "rotina_refresh_busy" });
        } else if (!closed && !request.signal.aborted) {
          logServerError("api/rotina/refresh POST", e);
          send({ type: "error", message: "rotina_refresh_failed" });
        }
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
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
