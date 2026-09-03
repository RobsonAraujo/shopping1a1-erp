import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchOperationalListings } from "@/lib/mercadolibre/api";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  try {
    const items = await fetchOperationalListings(token, userId, organizationId);

    const existing = await prisma.product.findMany({
      where: { organizationId, mlItemId: { in: items.map((item) => item.id) } },
      select: { mlItemId: true },
    });
    const existingSet = new Set(existing.map((row) => row.mlItemId));

    const suggestions = items
      .filter((item) => !existingSet.has(item.id))
      .map((item) => ({ mlItemId: item.id, sku: getItemSku(item) }))
      .sort((a, b) =>
        (a.sku ?? a.mlItemId).localeCompare(b.sku ?? b.mlItemId, "pt-BR", {
          sensitivity: "base",
        }),
      );

    return NextResponse.json({ suggestions });
  } catch (e) {
    logServerError("api/products/suggestions GET", e);
    return NextResponse.json(apiErrorPayload(e, "products_suggestions_failed"), {
      status: 502,
    });
  }
}
