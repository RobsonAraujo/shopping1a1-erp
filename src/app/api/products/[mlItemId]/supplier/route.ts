import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { loadListingGroups } from "@/lib/products/listing-groups";

type RouteContext = { params: Promise<{ mlItemId: string }> };

const bodySchema = z.object({
  supplierId: z.string().trim().nullable(),
});

/**
 * Atribuição rápida de fornecedor (usada pelo drag-and-drop em Fornecedores)
 * — endpoint dedicado e enxuto pra não exigir o payload fiscal completo que
 * `PATCH /api/products/[mlItemId]` pede (unitCostNf etc.).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { mlItemId } = await context.params;

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { supplierId } = parsedBody.data;

  try {
    const product = await prisma.product.update({
      where: { mlItemId, organizationId },
      data: {
        supplier: supplierId ? { connect: { id: supplierId } } : { disconnect: true },
      },
      select: {
        mlItemId: true,
        sku: true,
        supplier: { select: { id: true, name: true } },
      },
    });
    // Opções de venda: o fornecedor é do produto — um cadastro duplicado
    // antigo (com custo) de outra opção acompanha o principal.
    const groups = await loadListingGroups(organizationId);
    if (!groups.isOption(mlItemId)) {
      const duplicateIds = groups
        .optionsOf(mlItemId)
        .filter((o) => !o.isPrincipal && o.registered && !o.pendingCost)
        .map((o) => o.mlItemId);
      if (duplicateIds.length > 0) {
        await prisma.product.updateMany({
          where: { organizationId, mlItemId: { in: duplicateIds } },
          data: { supplierId: supplierId ?? null },
        });
      }
    }
    return NextResponse.json({ product });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Fornecedor selecionado não existe" },
        { status: 400 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }
    logServerError("api/products/[mlItemId]/supplier PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "product_supplier_update_failed"), {
      status: 502,
    });
  }
}
