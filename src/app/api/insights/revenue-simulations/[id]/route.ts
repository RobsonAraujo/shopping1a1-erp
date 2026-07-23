import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";
import type { RevenueSimulationPayload } from "@/lib/insights/types";

type RouteContext = { params: Promise<{ id: string }> };

async function requireSellerId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return userId;
}

function isValidPayload(value: unknown): value is RevenueSimulationPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    isRecordOfNumbers(p.overrides) &&
    isRecordOfBooleans(p.excluded) &&
    typeof p.periodDays === "number" &&
    Number.isFinite(p.periodDays) &&
    isRecordOfNumbers(p.installmentsBySupplier)
  );
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((v) => typeof v === "number" && Number.isFinite(v));
}

function isRecordOfBooleans(value: unknown): value is Record<string, boolean> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((v) => typeof v === "boolean");
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const sellerId = await requireSellerId();
  if (sellerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const simulation = await prisma.revenueSimulation.findFirst({
      where: { id, sellerId },
      select: { id: true, name: true, payload: true, createdAt: true, updatedAt: true },
    });
    if (!simulation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ simulation });
  } catch (e) {
    logServerError("api/insights/revenue-simulations/[id] GET", e);
    return NextResponse.json(apiErrorPayload(e, "revenue_simulation_get_failed"), {
      status: 502,
    });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const sellerId = await requireSellerId();
  if (sellerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: { name?: string; payload?: unknown };
  try {
    body = (await request.json()) as { name?: string; payload?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidPayload(body.payload)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data: { payload: RevenueSimulationPayload; name?: string } = {
    payload: body.payload,
  };
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    data.name = name;
  }

  try {
    const existing = await prisma.revenueSimulation.findFirst({
      where: { id, sellerId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const simulation = await prisma.revenueSimulation.update({
      where: { id },
      data,
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ simulation });
  } catch (e) {
    logServerError("api/insights/revenue-simulations/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "revenue_simulation_update_failed"), {
      status: 502,
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const sellerId = await requireSellerId();
  if (sellerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.revenueSimulation.findFirst({
      where: { id, sellerId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.revenueSimulation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/insights/revenue-simulations/[id] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "revenue_simulation_delete_failed"), {
      status: 502,
    });
  }
}
