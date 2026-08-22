import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const revenueSimulationPayloadSchema = z.object({
  overrides: z.record(z.string(), z.number().finite()),
  excluded: z.record(z.string(), z.boolean()),
  periodDays: z.number().finite(),
  installmentsBySupplier: z.record(z.string(), z.number().finite()),
});

const createSimulationSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  payload: revenueSimulationPayloadSchema,
});

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const sellerId = auth.ctx.userId;

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
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { userId: sellerId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, createSimulationSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { name, payload } = parsedBody.data;

  try {
    const simulation = await prisma.revenueSimulation.create({
      data: { organizationId, sellerId, name, payload },
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
