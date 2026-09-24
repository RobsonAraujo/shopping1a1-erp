import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import {
  buildProductView,
  diffLevelableProductFields,
  ensureCompanySettings,
  listingImageUrlForMlItemId,
  productPatchToPrismaData,
  validateProductInput,
} from "@/lib/products/product-data";
import { productDeleteBlockedMessage } from "@/lib/products/product-delete-guard";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

type RouteContext = { params: Promise<{ mlItemId: string }> };

// `sku` não entra: é espelho do anúncio no ML, escrito só pela criação e pelo
// sync (`POST /api/products/[mlItemId]/sync-sku`) — nunca pelo formulário.
const productPatchBodySchema = z.object({
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
  supplierId: z.string().trim().nullable().optional(),
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
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const companyTaxContext = {
      taxRegime: settings.taxRegime,
      simplesAliquotaEfetivaPercent: settings.simplesAliquotaEfetivaPercent,
    };
    const imageUrl = await listingImageUrlForMlItemId(
      organizationId,
      product.mlItemId,
    );
    return NextResponse.json({
      product: buildProductView(
        product,
        settings.pisCofinsPercent,
        undefined,
        companyTaxContext,
        imageUrl,
        product.supplier,
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
      // Valor já gravado — só alimenta `validateProductInput`, não é reescrito.
      sku: before.sku ?? "",
    };
    const validationError = validateProductInput(parsed);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const settings = await ensureCompanySettings(organizationId);
    const data = productPatchToPrismaData(parsed);
    const product = await prisma.product.update({
      where: { mlItemId, organizationId },
      data,
      include: { supplier: { select: { id: true, name: true } } },
    });

    const { changedFields, previousValues } = diffLevelableProductFields(
      before,
      parsed,
    );

    const imageUrl = await listingImageUrlForMlItemId(
      organizationId,
      product.mlItemId,
    );
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
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Fornecedor selecionado não existe" },
        { status: 400 },
      );
    }
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
    // Cada dependência reage de um jeito silencioso ao delete (KitItem em
    // cascade apaga o componente do kit; o nivelamento do DRE perde a
    // identidade) — por isso são checadas antes, e não deixadas para o banco.
    const [warehouseStock, levelingCount, kitCount] = await Promise.all([
      prisma.warehouseStock.findFirst({
        where: { mlItemId, organizationId },
        select: { quantity: true },
      }),
      prisma.dreProductCostLeveling.count({
        where: { organizationId, productMlItemId: mlItemId },
      }),
      prisma.kitItem.count({
        where: { organizationId, productMlItemId: mlItemId },
      }),
    ]);

    const blockedMessage = productDeleteBlockedMessage({
      warehouseQuantity: warehouseStock?.quantity ?? 0,
      levelingCount,
      kitCount,
    });
    if (blockedMessage) {
      return NextResponse.json({ error: blockedMessage }, { status: 409 });
    }

    await prisma.product.delete({ where: { mlItemId, organizationId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/products/[mlItemId] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "product_delete_failed"), {
      status: 502,
    });
  }
}
