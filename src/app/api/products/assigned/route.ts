import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";

/**
 * Lista enxuta (mlItemId, sku, supplierId) dos produtos JÁ vinculados a um
 * fornecedor — usada em Fornecedores pra mostrar/arrastar os produtos de
 * cada fornecedor (visualização + "tirar do fornecedor" arrastando de
 * volta). Irmã de `GET /api/products/unassigned`; sem imagem de propósito
 * (evita N lookups de thumbnail pra uma lista que pode ser maior que a de
 * não vinculados).
 */
export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  try {
    const rows = await prisma.product.findMany({
      where: { organizationId, supplierId: { not: null } },
      orderBy: { sku: "asc" },
      select: { mlItemId: true, sku: true, supplierId: true },
    });
    const products = rows.map((p) => ({
      mlItemId: p.mlItemId,
      sku: p.sku,
      supplierId: p.supplierId as string,
    }));
    return NextResponse.json({ products });
  } catch (e) {
    logServerError("api/products/assigned GET", e);
    return NextResponse.json(apiErrorPayload(e, "assigned_products_load_failed"), {
      status: 502,
    });
  }
}
