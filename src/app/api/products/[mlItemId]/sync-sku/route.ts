import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/db";
import {
  buildProductView,
  ensureCompanySettings,
  listingImageUrlForMlItemId,
} from "@/lib/products/product-data";
import { syncProductSkusFromMl } from "@/lib/products/product-sku-sync";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";

type RouteContext = { params: Promise<{ mlItemId: string }> };

/**
 * Re-lê o SKU deste anúncio no Mercado Livre e grava em `Product.sku`.
 *
 * Endpoint isolado do PATCH principal pelo mesmo motivo do `status`: aquele
 * exige o formulário de custo inteiro e dispara sugestão de nivelamento de
 * custo do DRE. Devolve o `ProductView` completo para o client atualizar a
 * linha sem refazer `GET /api/products`.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, organizationId } = auth.ctx;

  const { mlItemId } = await context.params;

  try {
    const existing = await prisma.product.findUnique({
      where: { mlItemId, organizationId },
      select: { mlItemId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const result = await syncProductSkusFromMl(organizationId, token, [mlItemId]);

    if (result.failedBatches > 0) {
      return NextResponse.json(
        { error: "O Mercado Livre não respondeu. Tente novamente em instantes." },
        { status: 502 },
      );
    }
    if (result.notFound.length > 0) {
      return NextResponse.json(
        { error: "Anúncio não encontrado no Mercado Livre" },
        { status: 404 },
      );
    }

    const [settings, product] = await Promise.all([
      ensureCompanySettings(organizationId),
      prisma.product.findUniqueOrThrow({
        where: { mlItemId, organizationId },
        include: { supplier: { select: { id: true, name: true } } },
      }),
    ]);
    const imageUrl = await listingImageUrlForMlItemId(organizationId, mlItemId);

    return NextResponse.json({
      product: buildProductView(
        product,
        settings.pisCofinsPercent,
        undefined,
        {
          taxRegime: settings.taxRegime,
          simplesAliquotaEfetivaPercent: settings.simplesAliquotaEfetivaPercent,
        },
        imageUrl,
        product.supplier,
      ),
      changed: result.updated.length > 0,
      // Anúncio existe mas está sem SKU no ML — o valor gravado foi preservado.
      withoutSku: result.withoutSku.length > 0,
    });
  } catch (e) {
    logServerError("api/products/[mlItemId]/sync-sku POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_sku_sync_failed"), {
      status: 502,
    });
  }
}
