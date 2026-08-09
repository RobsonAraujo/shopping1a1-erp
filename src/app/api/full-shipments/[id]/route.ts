import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteFullShipment,
  updateFullShipment,
} from "@/lib/envios-full/full-shipment-data";
import { FullShipmentValidationError } from "@/lib/envios-full/full-shipment";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch: {
      shippedAt?: Date;
      totalCost?: number;
      totalUnits?: number;
      notes?: string | null;
    } = {};

    if (body.shippedAt !== undefined) {
      const shippedAt = parseDate(body.shippedAt);
      if (!shippedAt) {
        return NextResponse.json(
          { error: "Informe uma data de envio válida." },
          { status: 400 },
        );
      }
      patch.shippedAt = shippedAt;
    }

    if (body.totalCost !== undefined) {
      patch.totalCost = Number(body.totalCost);
    }

    if (body.totalUnits !== undefined) {
      patch.totalUnits = Number(body.totalUnits);
    }

    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === "string" ? body.notes : null;
    }

    const shipment = await updateFullShipment(id, patch);
    return NextResponse.json({ shipment });
  } catch (e) {
    if (e instanceof FullShipmentValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logServerError("api/full-shipments/[id] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "full_shipment_update_failed"), {
      status: 502,
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await deleteFullShipment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/full-shipments/[id] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "full_shipment_delete_failed"), {
      status: 502,
    });
  }
}
