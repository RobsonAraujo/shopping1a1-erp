import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createFullShipment,
  listFullShipments,
  listFullShipmentsForPeriod,
  listImportedBillingPeriods,
} from "@/lib/full-shipment-data";
import { FullShipmentValidationError } from "@/lib/full-shipment";
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

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const shippedAt = parseDate(body.shippedAt);
    const totalCost = Number(body.totalCost);
    const totalUnits = Number(body.totalUnits);
    const notes = typeof body.notes === "string" ? body.notes : null;

    if (!shippedAt) {
      return NextResponse.json(
        { error: "Informe uma data de envio válida." },
        { status: 400 },
      );
    }

    const shipment = await createFullShipment({
      shippedAt,
      totalCost,
      totalUnits,
      notes,
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
