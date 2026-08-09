import { NextRequest, NextResponse } from "next/server";
import { importFullCollectChargesFromBilling } from "@/lib/envios-full/full-shipment-data";
import { FullShipmentValidationError } from "@/lib/envios-full/full-shipment";
import { MlApiFetchError } from "@/lib/mercadolibre/fetch-with-retry";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody, yearMonthSchema } from "@/lib/api-validation";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) {
    return unauthorizedResponse();
  }

  const parsedBody = await parseJsonBody(request, yearMonthSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month } = parsedBody.data;

  try {
    const result = await importFullCollectChargesFromBilling(
      auth.token,
      auth.userId,
      year,
      month,
    );

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof MlApiFetchError) {
      return NextResponse.json(
        {
          error:
            "API do Mercado Livre indisponível no momento. Aguarde alguns segundos e tente novamente.",
        },
        { status: 502 },
      );
    }
    if (e instanceof FullShipmentValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logServerError("api/full-shipments/import-ml POST", e);
    return NextResponse.json(apiErrorPayload(e, "full_shipments_import_failed"), {
      status: 502,
    });
  }
}
