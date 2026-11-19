import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import {
  CalculatorListingNotFoundError,
  computeCalculatorFloor,
} from "@/lib/calculadora/live-read";
import { calculatorFloorSchema } from "@/lib/calculadora/request-schema";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

export const maxDuration = 60;

/**
 * Calculadora: o menor preço para a margem escolhida, com os insumos da
 * leitura (e o TACOS da base escolhida). ~20–40 cotações no ML, só sob demanda.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, calculatorFloorSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const floor = await computeCalculatorFloor(organizationId, {
      token,
      userId,
      body: parsedBody.data,
    });
    return NextResponse.json(floor, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CalculatorListingNotFoundError) {
      return NextResponse.json({ error: "calculator_listing_not_found" }, { status: 404 });
    }
    logServerError("api/calculadora/floor POST", e);
    return NextResponse.json(apiErrorPayload(e, "calculator_floor_failed"), { status: 502 });
  }
}
