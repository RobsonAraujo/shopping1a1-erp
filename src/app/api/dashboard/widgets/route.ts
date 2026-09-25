import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseQuery } from "@/lib/api/api-validation";
import { resolveHomeWidgetData } from "@/lib/home/dashboard/home-widget-data";
import { parseHomeWidgetDataKeys } from "@/lib/home/dashboard/widget-data-keys";

/**
 * O único request extra da Home: resolve de uma vez as chaves de dado de
 * TODOS os widgets visíveis que não vêm do snapshot de servidor. Um request
 * independentemente de quantos widgets existam, e nada é buscado pra widget
 * escondido (o client só manda as chaves dos visíveis).
 *
 * **Sem `maxDuration` de propósito.** Um request só significa que a chave
 * mais lenta trava as outras, então vale a invariante do registry: loader que
 * possa passar de ~1,5s — ou que chame o Mercado Livre — não entra aqui, vai
 * como widget isolado com rota própria. Se uma chave medir lenta, a correção
 * é dividir a chave, não aumentar o timeout.
 */
export const dynamic = "force-dynamic";

const querySchema = z.object({
  keys: z.string().min(1).max(120),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { userId, organizationId } = auth.ctx;

  const query = parseQuery(
    Object.fromEntries(request.nextUrl.searchParams),
    querySchema,
  );
  if (!query.ok) return query.response;

  const keys = parseHomeWidgetDataKeys(query.data.keys);
  if (keys.length === 0) {
    return NextResponse.json({ error: "invalid_keys" }, { status: 400 });
  }

  const payload = await resolveHomeWidgetData(
    {
      organizationId,
      // Só daqui. `TaxReportMonthSnapshot` é escopada por sellerId e está fora
      // do tenant guard — um sellerId vindo da query não seria pego por nada.
      sellerId: userId,
      year: query.data.year ?? new Date().getFullYear(),
    },
    keys,
  );

  // Sempre 200 quando autorizado: cada chave carrega o próprio ok/erro, e uma
  // slice quebrada tem que degradar só o card dela — nunca apagar a Home.
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
