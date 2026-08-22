import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeProductSku } from "@/lib/product-pricing";
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
    const skuSet = new Set<string>();
    for (const item of items) {
      const sku = getItemSku(item);
      if (sku) skuSet.add(normalizeProductSku(sku));
    }

    const existing = await prisma.product.findMany({
      where: { organizationId, sku: { in: [...skuSet] } },
      select: { sku: true },
    });
    const existingSet = new Set(existing.map((row) => row.sku));
    const suggestions = [...skuSet]
      .filter((sku) => !existingSet.has(sku))
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

    return NextResponse.json({ suggestions });
  } catch (e) {
    logServerError("api/products/suggestions GET", e);
    return NextResponse.json(apiErrorPayload(e, "products_suggestions_failed"), {
      status: 502,
    });
  }
}
