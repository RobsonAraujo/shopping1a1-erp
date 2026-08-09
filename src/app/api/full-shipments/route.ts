import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createFullShipment,
  listFullShipments,
  listFullShipmentsForPeriod,
  listImportedBillingPeriods,
} from "@/lib/envios-full/full-shipment-data";
import { FullShipmentValidationError } from "@/lib/envios-full/full-shipment";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const createShipmentSchema = z.object({
  shippedAt: z.coerce.date({ error: "Informe uma data de envio válida." }),
  totalCost: z.coerce.number().finite(),
  totalUnits: z.coerce.number().finite(),
  notes: z.string().nullish(),
});

export async function GET(request: NextRequest) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  try {
    const yearRaw = request.nextUrl.searchParams.get("year");
    const monthRaw = request.nextUrl.searchParams.get("month");
    const importedPeriods = await listImportedBillingPeriods();

    if (yearRaw != null && monthRaw != null) {
      const year = Number(yearRaw);
      const month = Number(monthRaw);
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

      const shipments = await listFullShipmentsForPeriod(year, month);
      return NextResponse.json({ shipments, year, month, importedPeriods });
    }

    const shipments = await listFullShipments();
    return NextResponse.json({ shipments, importedPeriods });
  } catch (e) {
    logServerError("api/full-shipments GET", e);
    return NextResponse.json(apiErrorPayload(e, "full_shipments_load_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const parsedBody = await parseJsonBody(request, createShipmentSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { shippedAt, totalCost, totalUnits, notes } = parsedBody.data;

  try {
    const shipment = await createFullShipment({
      shippedAt,
      totalCost,
      totalUnits,
      notes: notes ?? null,
      source: "manual",
    });

    return NextResponse.json({ shipment }, { status: 201 });
  } catch (e) {
    if (e instanceof FullShipmentValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logServerError("api/full-shipments POST", e);
    return NextResponse.json(apiErrorPayload(e, "full_shipment_create_failed"), {
      status: 502,
    });
  }
}
