import { NextRequest, NextResponse } from "next/server";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * SKU atual de um anúncio, sem tocar no banco — serve ao formulário de
 * cadastro, onde o `Product` ainda não existe e não há o que sincronizar.
 * Endpoint próprio em vez de reusar `/api/ml/items/[id]` (que devolve o
 * `ItemBody` cru) porque `getItemSku` conhece as duas origens possíveis do SKU
 * no ML (`seller_custom_field` e o atributo `SELLER_SKU`) e não deve ser
 * replicado no client.
 *
 * Para um produto já cadastrado, use `POST /api/products/[mlItemId]/sync-sku`,
 * que persiste o valor.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await context.params;

  try {
    const item = await fetchItemById(auth.ctx.token, id);
    if (!item) {
      return NextResponse.json(
        { error: "Anúncio não encontrado no Mercado Livre" },
        { status: 404 },
      );
    }
    return NextResponse.json({ sku: getItemSku(item), title: item.title });
  } catch (e) {
    logServerError("api/ml/items/[id]/sku GET", e);
    return NextResponse.json(apiErrorPayload(e, "ml_item_sku_failed"), {
      status: 502,
    });
  }
}
