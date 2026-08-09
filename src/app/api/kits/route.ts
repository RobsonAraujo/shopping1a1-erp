import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

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
        sku: z.string().min(1).transform(normalizeProductSku),
        quantity: z.coerce.number().finite().positive().default(1),
      }),
    )
    .min(1, "Informe pelo menos 1 item"),
});

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  try {
    const kits = await prisma.kit.findMany({
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    return NextResponse.json({ kits });
  } catch (e) {
    logServerError("api/kits GET", e);
    return NextResponse.json(apiErrorPayload(e, "kits_load_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const parsedBody = await parseJsonBody(request, kitWriteSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parsedBody.data;

  try {
    const kit = await prisma.kit.create({
      data: {
        mlItemId: parsed.mlItemId,
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
    return NextResponse.json({ kit });
  } catch (e) {
    logServerError("api/kits POST", e);
    return NextResponse.json(apiErrorPayload(e, "kit_create_failed"), {
      status: 502,
    });
  }
}
