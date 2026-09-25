import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { loadPmaAlerts } from "@/lib/home/pma-alert-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

/**
 * Alertas de preço abaixo do PMA. Rota própria (fora do batch) porque faz 1-2
 * chamadas ao Mercado Livre por anúncio com PMA cadastrado — juntar isso ao
 * batch faria a chave mais lenta travar o faturamento e o estoque.
 *
 * Antes isto rodava dentro do render da Home, num `<Suspense>` sem
 * `maxDuration`: ficava no orçamento de render da página e não havia como não
 * pagar por ele quando o widget estava escondido.
 */
export const maxDuration = 60;

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, organizationId } = auth.ctx;

  try {
    const rows = await loadPmaAlerts(token, organizationId);
    return NextResponse.json(
      { rows },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    logServerError("api/dashboard/widgets/pma GET", e);
    return NextResponse.json(apiErrorPayload(e, "pma_alerts_failed"), {
      status: 502,
    });
  }
}
