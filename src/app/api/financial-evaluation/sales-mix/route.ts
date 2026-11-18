import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { calendarYmdRangeToUtc } from "@/lib/lucratividade/financial-evaluation-period";
import { loadSalesMixForItem } from "@/lib/lucratividade/sales-mix-orders";

export const maxDuration = 300;

const ITEM_ID_RE = /^[A-Z]{3}\d+$/;

/**
 * Composição das vendas de um anúncio no período (painel da Lucratividade):
 * canal × forma de envio × tipo de anúncio de cada pedido. Só lê do ML.
 * `until` (ISO) = `meta.ordersFetchedAt` do período, pra fechar com a linha.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId } = auth.ctx;

  const params = request.nextUrl.searchParams;
  const itemId = params.get("itemId")?.trim() ?? "";
  if (!ITEM_ID_RE.test(itemId)) {
    return NextResponse.json({ error: "invalid_item_id" }, { status: 400 });
  }
  const range = calendarYmdRangeToUtc(params.get("from") ?? "", params.get("to") ?? "");
  if (!range) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }
  const untilParam = params.get("until");
  const until = untilParam ? new Date(untilParam) : null;
  if (until && Number.isNaN(until.getTime())) {
    return NextResponse.json({ error: "invalid_until" }, { status: 400 });
  }

  // O painel fechou/trocou de anúncio: para de consultar envios no ML.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  try {
    const result = await loadSalesMixForItem(token, userId, itemId, range, {
      until,
      signal: abort.signal,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (abort.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    logServerError("api/financial-evaluation/sales-mix GET", e);
    return NextResponse.json(apiErrorPayload(e, "sales_mix_failed"), {
      status: 502,
    });
  }
}
