import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";
import type { RevenueSimulationPayload } from "@/lib/insights/types";

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

export async function GET() {
  const sellerId = await requireSellerId();
  if (sellerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const simulations = await prisma.revenueSimulation.findMany({
      where: { sellerId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ simulations });
  } catch (e) {
    logServerError("api/insights/revenue-simulations GET", e);
    return NextResponse.json(apiErrorPayload(e, "revenue_simulations_list_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  const sellerId = await requireSellerId();
  if (sellerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; payload?: unknown };
  try {
    body = (await request.json()) as { name?: string; payload?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!isValidPayload(body.payload)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const simulation = await prisma.revenueSimulation.create({
      data: { sellerId, name, payload: body.payload },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ simulation });
  } catch (e) {
    logServerError("api/insights/revenue-simulations POST", e);
    return NextResponse.json(apiErrorPayload(e, "revenue_simulation_create_failed"), {
      status: 502,
    });
  }
}
