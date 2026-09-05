import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/db";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { authorizeBearerSecret } from "@/lib/api/api-auth";
import type { OrganizationStatus } from "@/generated/prisma";

const VALID_STATUSES: OrganizationStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
];

/**
 * Troca manual do status de pagamento de uma organização — sem gateway de
 * pagamento nesta fase. Uso: curl/Postman ou Prisma Studio direto.
 *
 *   curl -X PATCH .../api/admin/organizations/<id>/status \
 *     -H "Authorization: Bearer $ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"status":"active","note":"pago via Pix em 21/08"}'
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!authorizeBearerSecret(request, process.env.ADMIN_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { status?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.includes(body.status as OrganizationStatus)) {
    return NextResponse.json(
      { error: "invalid_status", allowed: VALID_STATUSES },
      { status: 400 },
    );
  }

  try {
    const organization = await prisma.organization.update({
      where: { id },
      data: {
        status: body.status as OrganizationStatus,
        statusUpdatedAt: new Date(),
        statusNote: body.note ?? null,
      },
    });
    return NextResponse.json({ organization });
  } catch (e) {
    logServerError("api/admin/organizations/[id]/status", e);
    return NextResponse.json(apiErrorPayload(e, "update_failed"), {
      status: 404,
    });
  }
}
