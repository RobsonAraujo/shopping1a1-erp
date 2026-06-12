import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) {
    return null;
  }
  return true;
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await prisma.dreCostItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ items });
  } catch (e) {
    logServerError("api/dre/cost-items GET", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_items_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const maxSort = await prisma.dreCostItem.aggregate({
      _max: { sortOrder: true },
    });
    const item = await prisma.dreCostItem.create({
      data: {
        name,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ item });
  } catch (e) {
    logServerError("api/dre/cost-items POST", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_item_create_failed"), {
      status: 502,
    });
  }
}
