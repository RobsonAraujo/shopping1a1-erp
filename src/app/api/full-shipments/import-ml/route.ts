import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { importFullCollectChargesFromBilling } from "@/lib/envios-full/full-shipment-data";
import { FullShipmentValidationError } from "@/lib/envios-full/full-shipment";
import { MlApiFetchError } from "@/lib/mercadolibre/fetch-with-retry";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return { token, userId };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const year = Number(body.year);
    const month = Number(body.month);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json(
        { error: "Informe ano e mês válidos." },
        { status: 400 },
      );
    }

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
