import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/db";
import { loadListingImageUrlsBySku } from "@/lib/products/product-data";
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
    const rows = await prisma.product.findMany({
      where: { organizationId, supplierId: null },
      orderBy: { sku: "asc" },
      select: { mlItemId: true, sku: true },
    });
    const skus = rows.map((p) => p.sku).filter((s): s is string => s !== null);
    const imageUrlsBySku = await loadListingImageUrlsBySku(organizationId, skus);
    const products = rows.map((p) => ({
      mlItemId: p.mlItemId,
      sku: p.sku,
      imageUrl: p.sku ? (imageUrlsBySku.get(p.sku) ?? null) : null,
    }));
    return NextResponse.json({ products });
  } catch (e) {
    logServerError("api/products/unassigned GET", e);
    return NextResponse.json(apiErrorPayload(e, "unassigned_products_load_failed"), {
      status: 502,
    });
  }
}
