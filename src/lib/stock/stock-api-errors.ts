import { NextResponse } from "next/server";
import { logServerError } from "@/lib/infra/server-public-error";
import { StockActionError } from "@/lib/stock/stock-actions";

const STATUS_BY_CODE: Record<StockActionError["code"], number> = {
  not_activated: 409,
  invalid_input: 400,
  item_not_found: 404,
  entry_not_found: 404,
  entry_consumed: 409,
  entry_reversed: 409,
  review_not_found: 404,
  review_closed: 409,
  count_not_found: 404,
  count_closed: 409,
  count_empty: 400,
  count_open_exists: 409,
  count_approved: 409,
};

/** Resposta de erro das rotas de ação do estoque (código mapeado em api-client-error.ts). */
export function stockActionErrorResponse(context: string, e: unknown): NextResponse {
  if (e instanceof StockActionError) {
    const code = e.code === "not_activated" ? "stock_not_activated" : `stock_${e.code}`;
    return NextResponse.json({ error: code }, { status: STATUS_BY_CODE[e.code] });
  }
  logServerError(context, e);
  return NextResponse.json({ error: "stock_action_failed" }, { status: 500 });
}
