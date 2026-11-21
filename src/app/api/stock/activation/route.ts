import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { logServerError } from "@/lib/infra/server-public-error";
import {
  StockAlreadyActivatedError,
  autoActivateStock,
  type StockActivationResult,
} from "@/lib/stock/stock-activation";
import { stockStreamResponse } from "@/lib/stock/stock-events";

export const maxDuration = 300;

/**
 * Ativa o estoque automático na primeira visita ao Estoque (SSE, com
 * progresso): liga os anúncios aos itens de estoque, lê depósito e Full no
 * ML e grava o saldo inicial. Se outra aba ou pessoa já ativou, também é
 * sucesso: a tela só recarrega.
 */
export async function POST(request: Request) {
  const auth = await requireOrganization();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { token, userId, organizationId } = auth.ctx;

  return stockStreamResponse<StockActivationResult>(
    request,
    async (send) => {
      try {
        const result = await autoActivateStock({
          organizationId,
          mlUserId: userId,
          accessToken: token,
          signal: request.signal,
          onProgress: (p) =>
            send(
              p.phase === "positions"
                ? { type: "progress", phase: "positions", done: p.done, total: p.total }
                : { type: "progress", phase: p.phase },
            ),
        });
        return { alreadyActive: false, items: result.items };
      } catch (e) {
        if (e instanceof StockAlreadyActivatedError) return { alreadyActive: true, items: 0 };
        throw e;
      }
    },
    (e) => {
      // "Parar" na tela: não é erro.
      if (request.signal.aborted) return null;
      logServerError("api/stock/activation POST", e);
      return "stock_activation_failed";
    },
  );
}
