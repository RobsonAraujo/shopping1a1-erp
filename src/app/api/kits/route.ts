import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";

type KitItemInput = { sku: string; quantity: number };
type KitWriteInput = {
  mlItemId: string;
  title: string | null;
  items: KitItemInput[];
};

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return true;
}

function parseKitBody(body: Record<string, unknown>): KitWriteInput | "invalid" {
  const mlItemId = typeof body.mlItemId === "string" ? body.mlItemId.trim() : "";
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

  if (!mlItemId || items.length === 0) return "invalid";

  return { mlItemId, title, items };
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseKitBody(body);
  if (parsed === "invalid") {
    return NextResponse.json({ error: "Invalid kit payload" }, { status: 400 });
  }

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
