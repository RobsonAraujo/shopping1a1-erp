import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import {
  CalculatorListingInactiveError,
  CalculatorListingNotFoundError,
  readCalculatorListingNow,
} from "@/lib/calculadora/live-read";
import { calculatorReadSchema } from "@/lib/calculadora/request-schema";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

export const maxDuration = 60;

/** Calculadora: lê um anúncio agora no ML (preço, taxa, frete, custo, imposto, TACOS de hoje). */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, calculatorReadSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const reading = await readCalculatorListingNow(organizationId, {
      token,
      userId,
      mlItemId: parsedBody.data.mlItemId,
    });
    return NextResponse.json(reading, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CalculatorListingNotFoundError) {
      return NextResponse.json({ error: "calculator_listing_not_found" }, { status: 404 });
    }
    if (e instanceof CalculatorListingInactiveError) {
      return NextResponse.json({ error: "calculator_listing_inactive" }, { status: 409 });
    }
    logServerError("api/calculadora/read POST", e);
    return NextResponse.json(apiErrorPayload(e, "calculator_read_failed"), { status: 502 });
  }
}
