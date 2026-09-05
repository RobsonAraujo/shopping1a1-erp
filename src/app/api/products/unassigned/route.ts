import { NextResponse } from "next/server";
import { loadUnassignedProducts } from "@/lib/fornecedores/fornecedores-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";

/**
 * Lista enxuta (sem custo/imposto) dos produtos sem fornecedor vinculado —
 * usada só pra popular o quadro de "arrastar pro fornecedor" em
 * Fornecedores. Evita reaproveitar `GET /api/products`, que já carrega
 * imposto/custo (desnecessário aqui). A miniatura reaproveita a mesma busca
 * em lote (`loadListingImageUrlsBySku`) já usada em Meus Produtos — uma
 * query extra e barata, indexada por SKU, nesta tela de baixo tráfego.
 */
export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  try {
    const products = await loadUnassignedProducts(organizationId);
    return NextResponse.json({ products });
  } catch (e) {
    logServerError("api/products/unassigned GET", e);
    return NextResponse.json(apiErrorPayload(e, "unassigned_products_load_failed"), {
      status: 502,
    });
  }
}
