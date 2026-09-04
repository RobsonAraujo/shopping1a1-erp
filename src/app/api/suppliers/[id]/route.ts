import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do fornecedor"),
    active: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Nada para atualizar",
  });

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { id } = await context.params;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const supplier = await prisma.supplier.update({
      where: { id, organizationId },
      data: parsedBody.data,
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({
      supplier: {
        id: supplier.id,
        name: supplier.name,
        active: supplier.active,
        productCount: supplier._count.products,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um fornecedor com esse nome" },
        { status: 409 },
      );
    }
    logServerError("api/suppliers/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "supplier_update_failed"), {
      status: 502,
    });
  }
}

/** Soft-delete: fornecedor referenciado por produtos não pode ser removido de
 * verdade sem derrubar o vínculo deles — só sai da lista/seletor ativo. */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { id } = await context.params;

  try {
    await prisma.supplier.update({
      where: { id, organizationId },
      data: { active: false },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/suppliers/[id] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "supplier_delete_failed"), {
      status: 502,
    });
  }
}
