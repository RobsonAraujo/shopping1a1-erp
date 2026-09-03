import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

const kitItemsSchema = z.object({
  title: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null)),
  items: z
    .array(
      z.object({
        productMlItemId: z.string().trim().min(1),
        quantity: z.coerce.number().finite().positive().default(1),
      }),
    )
    .min(1, "Informe pelo menos 1 item"),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { id: mlItemId } = await context.params;

  const parsedBody = await parseJsonBody(request, kitItemsSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parsedBody.data;

  try {
    const kit = await prisma.$transaction(async (tx) => {
      await tx.kitItem.deleteMany({ where: { kitId: mlItemId, organizationId } });
      return tx.kit.update({
        where: { mlItemId, organizationId },
        data: {
          title: parsed.title,
          items: {
            create: parsed.items.map((item) => ({
              organizationId,
              productMlItemId: item.productMlItemId,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: { include: { product: { select: { sku: true } } } } },
      });
    });
    return NextResponse.json({
      kit: {
        ...kit,
        items: kit.items.map((item) => ({
          productMlItemId: item.productMlItemId,
          sku: item.product.sku,
          quantity: item.quantity,
        })),
      },
    });
  } catch (e) {
    logServerError("api/kits/[id] PUT", e);
    return NextResponse.json(apiErrorPayload(e, "kit_update_failed"), {
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

  const { id: mlItemId } = await context.params;

  try {
    await prisma.kit.delete({ where: { mlItemId, organizationId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/kits/[id] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "kit_delete_failed"), {
      status: 502,
    });
  }
}
