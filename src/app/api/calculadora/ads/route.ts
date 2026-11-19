import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import {
  CalculatorListingNotFoundError,
  readCalculatorAds7d,
} from "@/lib/calculadora/live-read";
import { calculatorAdsSchema } from "@/lib/calculadora/request-schema";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

export const maxDuration = 30;

/** Calculadora: o TACOS de 7 dias de um anúncio, quando o usuário troca a base. */
export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, calculatorAdsSchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const ads = await readCalculatorAds7d(organizationId, {
      token,
      mlItemId: parsedBody.data.mlItemId,
    });
    return NextResponse.json(ads, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CalculatorListingNotFoundError) {
      return NextResponse.json({ error: "calculator_listing_not_found" }, { status: 404 });
    }
    logServerError("api/calculadora/ads POST", e);
    return NextResponse.json(apiErrorPayload(e, "calculator_ads_failed"), { status: 502 });
  }
}
