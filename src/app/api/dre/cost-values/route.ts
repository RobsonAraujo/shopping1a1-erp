import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    costItemId?: string;
    year?: number;
    month?: number;
    amount?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const costItemId = body.costItemId?.trim();
  const year = Number(body.year);
  const month = Number(body.month);
  const amount = body.amount;

  if (
    !costItemId ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (amount !== null && amount !== undefined) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
  }

  try {
    const item = await prisma.dreCostItem.findFirst({
      where: { id: costItemId, active: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Cost item not found" }, { status: 404 });
    }

    if (amount === null || amount === undefined) {
      await prisma.dreCostMonthValue.deleteMany({
        where: { costItemId, year, month },
      });
    } else {
      await prisma.dreCostMonthValue.upsert({
        where: {
          costItemId_year_month: { costItemId, year, month },
        },
        create: {
          costItemId,
          year,
          month,
          amount,
        },
        update: { amount },
      });
    }

    const yearView = await loadDreYearView(year);
    return NextResponse.json({ year: yearView });
  } catch (e) {
    logServerError("api/dre/cost-values PUT", e);
    return NextResponse.json(apiErrorPayload(e, "dre_cost_value_failed"), {
      status: 502,
    });
  }
}
