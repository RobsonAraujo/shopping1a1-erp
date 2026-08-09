import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  buildProductView,
  ensureCompanySettings,
  productWriteToPrismaData,
  validateProductInput,
} from "@/lib/product-data";
import { listAliasesForCanonicalSku } from "@/lib/product-sku-alias-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ sku: string }> };

const productPatchBodySchema = z.object({
  ncm: z.string().nullable().optional(),
  unitCostNf: z.coerce.number().finite(),
  purchaseIcmsPercent: z.coerce.number().finite(),
  hasIcmsSt: z.boolean().default(false),
  purchaseCostWithSt: z.coerce.number().finite().nullable().optional(),
  ipiPercent: z.coerce.number().finite().default(0),
  extraCosts: z.coerce.number().finite().default(0),
  isMonophasic: z.boolean().default(false),
  isImported: z.boolean().default(false),
  saleIcmsPercent: z.coerce.number().finite(),
  pmaPrice: z.coerce.number().finite().nullable().optional(),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  try {
    const settings = await ensureCompanySettings();
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const aliases = await listAliasesForCanonicalSku(sku);
    return NextResponse.json({
      product: buildProductView(product, settings.pisCofinsPercent),
      pisCofinsPercent: settings.pisCofinsPercent,
      aliases,
    });
  } catch (e) {
    logServerError("api/products/[sku] GET", e);
    return NextResponse.json(apiErrorPayload(e, "product_load_failed"), {
      status: 502,
    });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  const parsedBody = await parseJsonBody(request, productPatchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = { ...parsedBody.data, sku };

  const validationError = validateProductInput(parsed);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const settings = await ensureCompanySettings();
    const data = productWriteToPrismaData(parsed);
    const product = await prisma.product.update({
      where: { sku },
      data: {
        ncm: data.ncm,
        unitCostNf: data.unitCostNf,
        purchaseIcmsPercent: data.purchaseIcmsPercent,
        hasIcmsSt: data.hasIcmsSt,
        purchaseCostWithSt: data.purchaseCostWithSt,
        ipiPercent: data.ipiPercent,
        extraCosts: data.extraCosts,
        isMonophasic: data.isMonophasic,
        isImported: data.isImported,
        saleIcmsPercent: data.saleIcmsPercent,
        pmaPrice: data.pmaPrice,
      },
    });
    return NextResponse.json({
      product: buildProductView(product, settings.pisCofinsPercent),
    });
  } catch (e) {
    logServerError("api/products/[sku] PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "product_update_failed"), {
      status: 502,
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  try {
    await prisma.product.delete({ where: { sku } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/products/[sku] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "product_delete_failed"), {
      status: 502,
    });
  }
}
