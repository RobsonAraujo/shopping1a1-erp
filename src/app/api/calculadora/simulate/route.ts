import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import {
  CalculatorListingNotFoundError,
  simulateCalculatorPrices,
} from "@/lib/calculadora/live-read";
import { calculatorSimulateSchema } from "@/lib/calculadora/request-schema";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

export const maxDuration = 60;

/**
 * Calculadora: margem MC e após ADS em cada preço, com os insumos da leitura
 * que o navegador devolve — só taxa e frete são cotados no ML.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, calculatorSimulateSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const simulation = await simulateCalculatorPrices(organizationId, {
      token,
      userId,
      body: parsedBody.data,
    });
    return NextResponse.json(simulation, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CalculatorListingNotFoundError) {
      return NextResponse.json({ error: "calculator_listing_not_found" }, { status: 404 });
    }
    logServerError("api/calculadora/simulate POST", e);
    return NextResponse.json(apiErrorPayload(e, "calculator_simulate_failed"), { status: 502 });
  }
}
