import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

type RouteContext = { params: Promise<{ mlItemId: string }> };

const statusPatchBodySchema = z.object({
  active: z.boolean(),
});

/** Endpoint isolado do PATCH principal (`/api/products/[mlItemId]`) de
 * propósito: aquele exige unitCostNf/extraCosts e dispara sugestão de
 * nivelamento de custo do DRE — misturar o toggle ativo/inativo ali
 * arriscaria regressão nessa lógica sensível. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { mlItemId } = await context.params;

  const parsedBody = await parseJsonBody(request, statusPatchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const product = await prisma.product.update({
      where: { mlItemId, organizationId },
      data: { active: parsedBody.data.active },
      select: { mlItemId: true, active: true },
    });
    return NextResponse.json({ product });
  } catch (e) {
    logServerError("api/products/[mlItemId]/status PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "product_status_update_failed"), {
      status: 502,
    });
  }
}
