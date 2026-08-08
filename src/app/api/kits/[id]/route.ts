import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ id: string }> };
type KitItemInput = { sku: string; quantity: number };

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return true;
}

function parseKitItems(body: Record<string, unknown>): {
  title: string | null;
  items: KitItemInput[];
} | "invalid" {
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  const rawItems = Array.isArray(body.items) ? body.items : [];

  const items: KitItemInput[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null) return "invalid";
    const record = raw as Record<string, unknown>;
    const sku = typeof record.sku === "string" ? normalizeProductSku(record.sku) : "";
    const quantity = Number(record.quantity ?? 1);
    if (!sku || !Number.isFinite(quantity) || quantity <= 0) return "invalid";
    items.push({ sku, quantity });
  }

  if (items.length === 0) return "invalid";
  return { title, items };
}

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: mlItemId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseKitItems(body);
  if (parsed === "invalid") {
    return NextResponse.json({ error: "Invalid kit payload" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
