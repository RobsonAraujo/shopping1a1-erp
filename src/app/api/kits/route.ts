import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

const kitWriteSchema = z.object({
  mlItemId: z.string().trim().min(1),
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

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  try {
    const kits = await prisma.kit.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: { select: { sku: true } } } } },
    });
    return NextResponse.json({
      kits: kits.map((kit) => ({
        ...kit,
        items: kit.items.map((item) => ({
          productMlItemId: item.productMlItemId,
          sku: item.product.sku,
          quantity: item.quantity,
        })),
      })),
    });
  } catch (e) {
    logServerError("api/kits GET", e);
    return NextResponse.json(apiErrorPayload(e, "kits_load_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, kitWriteSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parsedBody.data;

  try {
    const kit = await prisma.kit.create({
      data: {
        organizationId,
        mlItemId: parsed.mlItemId,
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
    logServerError("api/kits POST", e);
    return NextResponse.json(apiErrorPayload(e, "kit_create_failed"), {
      status: 502,
    });
  }
}
