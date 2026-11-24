import { NextResponse } from "next/server";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { loadListingGroups } from "@/lib/products/listing-groups";
import { planProductImport } from "@/lib/products/product-options";

/**
 * Anúncios sem cadastro em Meus Produtos — **um por produto físico**: as
 * opções de venda (Clássico, Premium…) do mesmo produto entram juntas, no
 * anúncio principal; produto com qualquer opção já cadastrada não é sugerido.
 */
export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const items = await fetchOperationalListings(token, userId, organizationId);
    // O UP vem no corpo do anúncio: agrupa até a opção que o ERP ainda não viu.
    const groups = await loadListingGroups(organizationId, { extraItems: items });
    const plan = planProductImport(items, groups);
    return NextResponse.json(plan);
  } catch (e) {
    logServerError("api/products/suggestions GET", e);
    return NextResponse.json(apiErrorPayload(e, "products_suggestions_failed"), {
      status: 502,
    });
  }
}
