import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { logServerError } from "@/lib/infra/server-public-error";
import { stockStreamResponse } from "@/lib/stock/stock-events";
import {
  StockNotActivatedError,
  StockSyncBusyError,
  runStockSyncForSeller,
  type StockSyncRunResult,
} from "@/lib/stock/stock-sync";

export const maxDuration = 300;

const bodySchema = z.object({
  /**
   * Leitura do ML: `touched` (só o que vendeu), `auto` (tudo se a última
   * leitura completa passou de 2 h) ou `all` ("Reler tudo no ML").
   */
  positions: z.enum(["touched", "auto", "all"]).default("auto"),
  /** Chamada em segundo plano (`StockBackgroundSync`): dispensa se a leitura está fresca. */
  background: z.boolean().optional(),
});

/**
 * Sincronização do estoque (SSE): vendas novas e leitura do ML, com
 * progresso. Sem cron: a chamam a tela ("Sincronizar agora", "Reler tudo no
 * ML") e o `StockBackgroundSync`, em segundo plano, quando alguém usa o ERP.
 */
export async function POST(request: Request) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { token, userId, organizationId } = auth.ctx;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  return stockStreamResponse<StockSyncRunResult>(
    request,
    (send) =>
      runStockSyncForSeller({
        organizationId,
        mlUserId: userId,
        accessToken: token,
        positions: parsed.data.positions,
        background: parsed.data.background === true,
        signal: request.signal,
        onProgress: (p) =>
          send(
            p.phase === "orders"
              ? { type: "progress", phase: "orders" }
              : { type: "progress", phase: "positions", done: p.done, total: p.total },
          ),
      }),
    (e) => {
      if (e instanceof StockSyncBusyError) return "stock_sync_busy";
      if (e instanceof StockNotActivatedError) return "stock_not_activated";
      logServerError("api/stock/sync POST", e);
      return "stock_sync_failed";
    },
  );
}
