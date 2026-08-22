import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    sortOrder: z.number().int("Invalid sortOrder"),
    recurring: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
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
  const data = parsedBody.data;

  try {
    const item = await prisma.dreCostItem.update({
      where: { id, organizationId },
      data,
      select: { id: true, name: true, sortOrder: true, recurring: true },
    });
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/dre/cost-items PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_item_update_failed"), {
      status: 502,
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { id } = await context.params;

  try {
    await prisma.dreCostItem.update({
      where: { id, organizationId },
      data: { active: false },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/dre/cost-items DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_item_delete_failed"), {
      status: 502,
    });
  }
}
