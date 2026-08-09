import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
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
        sku: z.string().min(1).transform(normalizeProductSku),
        quantity: z.coerce.number().finite().positive().default(1),
      }),
    )
    .min(1, "Informe pelo menos 1 item"),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { id: mlItemId } = await context.params;

  const parsedBody = await parseJsonBody(request, kitItemsSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parsedBody.data;

  try {
    const kit = await prisma.$transaction(async (tx) => {
      await tx.kitItem.deleteMany({ where: { kitId: mlItemId } });
      return tx.kit.update({
        where: { mlItemId },
        data: {
          title: parsed.title,
          items: {
            create: parsed.items.map((item) => ({
              sku: item.sku,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });
    });
    return NextResponse.json({ kit });
  } catch (e) {
    logServerError("api/kits/[id] PUT", e);
    return NextResponse.json(apiErrorPayload(e, "kit_update_failed"), {
      status: 502,
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { id: mlItemId } = await context.params;

  try {
    await prisma.kit.delete({ where: { mlItemId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/kits/[id] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "kit_delete_failed"), {
      status: 502,
    });
  }
}
