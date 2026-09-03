import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  buildProductView,
  diffLevelableProductFields,
  ensureCompanySettings,
  listingImageUrlForSku,
  productPatchToPrismaData,
  validateProductInput,
} from "@/lib/product-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ mlItemId: string }> };

const productPatchBodySchema = z.object({
  sku: z.string().trim().nullable().optional(),
  ncm: z.string().nullable().optional(),
  unitCostNf: z.coerce.number().finite(),
  purchaseIcmsPercent: z.coerce.number().finite().optional(),
  hasIcmsSt: z.boolean().optional(),
  purchaseCostWithSt: z.coerce.number().finite().nullable().optional(),
  ipiPercent: z.coerce.number().finite().optional(),
  extraCosts: z.coerce.number().finite().default(0),
  isMonophasic: z.boolean().optional(),
  isImported: z.boolean().optional(),
  saleIcmsPercent: z.coerce.number().finite().optional(),
  pmaPrice: z.coerce.number().finite().nullable().optional(),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { mlItemId } = await context.params;

  try {
    const settings = await ensureCompanySettings(organizationId);
    const product = await prisma.product.findUnique({
      where: { mlItemId, organizationId },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const companyTaxContext = {
      taxRegime: settings.taxRegime,
      simplesAliquotaEfetivaPercent: settings.simplesAliquotaEfetivaPercent,
    };
    const imageUrl = product.sku
      ? await listingImageUrlForSku(organizationId, product.sku)
      : null;
    return NextResponse.json({
      product: buildProductView(
        product,
        settings.pisCofinsPercent,
        undefined,
        companyTaxContext,
        imageUrl,
      ),
      pisCofinsPercent: settings.pisCofinsPercent,
      taxRegime: settings.taxRegime,
    });
  } catch (e) {
    logServerError("api/products/[mlItemId] GET", e);
    return NextResponse.json(apiErrorPayload(e, "product_load_failed"), {
      status: 502,
    });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { mlItemId } = await context.params;

  const parsedBody = await parseJsonBody(request, productPatchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const before = await prisma.product.findUnique({
      where: { mlItemId, organizationId },
    });
    if (!before) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const parsed = {
      ...parsedBody.data,
      mlItemId,
      sku: parsedBody.data.sku?.trim() || before.sku || "",
    };
    const validationError = validateProductInput(parsed);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (parsed.sku && parsed.sku !== before.sku) {
      const skuInUse = await prisma.product.findFirst({
        where: { organizationId, sku: parsed.sku, mlItemId: { not: mlItemId } },
        select: { mlItemId: true },
      });
      if (skuInUse) {
        return NextResponse.json(
          {
            error: `Este SKU já está em uso por outro produto (${skuInUse.mlItemId}). SKU é só exibição, mas usar o mesmo texto em dois produtos mistura os dois num relatório só.`,
          },
          { status: 409 },
        );
      }
    }

    const settings = await ensureCompanySettings(organizationId);
    const data = productPatchToPrismaData(parsed);
    const product = await prisma.product.update({
      where: { mlItemId, organizationId },
      data,
    });

    const { changedFields, previousValues } = diffLevelableProductFields(
      before,
      parsed,
    );

    const imageUrl = product.sku
      ? await listingImageUrlForSku(organizationId, product.sku)
      : null;
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
      ),
      levelingSuggestion:
        changedFields.length > 0
          ? {
              changedFields,
              previousValues,
              productCreatedAt: product.createdAt.toISOString(),
            }
          : null,
    });
  } catch (e) {
    logServerError("api/products/[mlItemId] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "product_update_failed"), {
      status: 502,
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { mlItemId } = await context.params;

  try {
    await prisma.product.delete({ where: { mlItemId, organizationId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/products/[mlItemId] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "product_delete_failed"), {
      status: 502,
    });
  }
}
