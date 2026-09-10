import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/db";
import { productWriteToPrismaData } from "@/lib/products/product-data";
import { fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

const bulkImportSchema = z.object({
  mlItemIds: z.array(z.string().trim().min(1)).min(1).max(500),
});

/**
 * Cadastra em lote os anúncios apontados por `GET /api/products/suggestions`
 * — cada produto nasce com `unitCostNf = 0` e `needsCostReview = true` (o
 * usuário edita depois pra preencher o custo real; enquanto pendente, o
 * produto não entra nos cálculos de DRE/Lucratividade/Relatório Tributário).
 * NCM/ST/monofásico/ICMS/IPI já são opcionais por padrão, então não bloqueiam
 * um import 100% automático.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, bulkImportSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const requestedIds = [...new Set(parsedBody.data.mlItemIds)];

  try {
    const existing = await prisma.product.findMany({
      where: { organizationId, mlItemId: { in: requestedIds } },
      select: { mlItemId: true },
    });
    const existingSet = new Set(existing.map((p) => p.mlItemId));
    const newIds = requestedIds.filter((id) => !existingSet.has(id));

    const items = newIds.length > 0 ? await fetchItemsByIdsBatched(token, newIds) : [];
    const notFoundCount = newIds.length - items.length;

    const rows = items.map((item) => ({
      ...productWriteToPrismaData(organizationId, {
        mlItemId: item.id,
        sku: getItemSku(item) ?? "",
        unitCostNf: 0,
        extraCosts: 0,
      }),
      needsCostReview: true,
    }));

    const result =
      rows.length > 0
        ? await prisma.product.createMany({ data: rows, skipDuplicates: true })
        : { count: 0 };

    return NextResponse.json({
      createdCount: result.count,
      skippedExistingCount: existingSet.size,
      notFoundCount,
    });
  } catch (e) {
    logServerError("api/products/bulk-import POST", e);
    return NextResponse.json(apiErrorPayload(e, "products_bulk_import_failed"), {
      status: 502,
    });
  }
}
