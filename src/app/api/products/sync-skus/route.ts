import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/db";
import { syncProductSkusFromMl } from "@/lib/products/product-sku-sync";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";

/** Varredura do catálogo inteiro da org no ML — bem além dos 10s do default. */
export const maxDuration = 300;

/**
 * Re-lê o SKU de todos os produtos cadastrados da organização.
 *
 * Parte dos `Product` da org, não de `fetchOperationalListings`: produto
 * pausado ou fora do catálogo operacional também precisa do SKU em dia, já
 * que continua contando em relatórios históricos.
 */
export async function POST() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, organizationId } = auth.ctx;

  try {
    const products = await prisma.product.findMany({
      where: { organizationId },
      select: { mlItemId: true },
    });

    const result = await syncProductSkusFromMl(
      organizationId,
      token,
      products.map((p) => p.mlItemId),
    );

    return NextResponse.json({
      total: products.length,
      updated: result.updated.length,
      unchanged: result.unchanged,
      withoutSku: result.withoutSku.length,
      notFound: result.notFound.length,
      failedBatches: result.failedBatches,
    });
  } catch (e) {
    logServerError("api/products/sync-skus POST", e);
    return NextResponse.json(apiErrorPayload(e, "products_sku_sync_failed"), {
      status: 502,
    });
  }
}
