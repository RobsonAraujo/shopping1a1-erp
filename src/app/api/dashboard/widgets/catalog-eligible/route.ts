import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { loadCatalogEligibleListings } from "@/lib/home/catalog-eligible-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

/**
 * Anúncios elegíveis para catálogo. Rota própria, fora do batch, porque chama o
 * Mercado Livre: a chave mais lenta do batch trava as outras.
 */
export const maxDuration = 60;

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId } = auth.ctx;

  try {
    const payload = await loadCatalogEligibleListings(token, userId);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    logServerError("api/dashboard/widgets/catalog-eligible GET", e);
    return NextResponse.json(apiErrorPayload(e, "catalog_eligible_failed"), {
      status: 502,
    });
  }
}
