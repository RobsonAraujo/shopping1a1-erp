import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

const revenueSimulationPayloadSchema = z.object({
  overrides: z.record(z.string(), z.number().finite()),
  excluded: z.record(z.string(), z.boolean()),
  periodDays: z.number().finite(),
  installmentsBySupplier: z.record(z.string(), z.number().finite()),
});

const patchSimulationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  payload: revenueSimulationPayloadSchema,
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const sellerId = auth.userId;

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
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const sellerId = auth.userId;

  const { id } = await context.params;

  const parsedBody = await parseJsonBody(request, patchSimulationSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const data = parsedBody.data;

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
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();
  const sellerId = auth.userId;

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
