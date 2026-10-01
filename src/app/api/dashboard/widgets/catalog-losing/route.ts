import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import {
  CATALOG_LOSING_FULL_LIMIT,
  loadCatalogLosingAlerts,
} from "@/lib/home/catalog-losing-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

/**
 * A lista completa de "catálogo perdendo" — **só quando alguém clica em "Ver
 * todos"**.
 *
 * O snapshot de servidor da Home traz 5 linhas mais o total; o resto sai daqui.
 * É a mesma ideia dos widgets isolados (PMA, promoções): quem não pede, não
 * paga. A maioria dos acessos nunca chama esta rota.
 *
 * Tem teto (`CATALOG_LOSING_FULL_LIMIT`), porque lista sem teto atrás de um
 * clique continua sendo lista sem teto. Acima disso o lugar é o relatório.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const result = await loadCatalogLosingAlerts(
      auth.ctx.organizationId,
      CATALOG_LOSING_FULL_LIMIT,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    logServerError("api/dashboard/widgets/catalog-losing GET", e);
    return NextResponse.json(apiErrorPayload(e, "catalog_losing_failed"), {
      status: 500,
    });
  }
}
