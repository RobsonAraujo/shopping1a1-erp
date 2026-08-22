import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  buildProductView,
  ensureCompanySettings,
  productPatchToPrismaData,
  validateProductInput,
} from "@/lib/product-data";
import { listAliasesForCanonicalSku } from "@/lib/product-sku-alias-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ sku: string }> };

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
});

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  try {
    const settings = await ensureCompanySettings(organizationId);
    const product = await prisma.product.findUnique({
      where: { organizationId_sku: { organizationId, sku } },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const aliases = await listAliasesForCanonicalSku(organizationId, sku);
    const companyTaxContext = {
      taxRegime: settings.taxRegime,
      simplesAliquotaEfetivaPercent: settings.simplesAliquotaEfetivaPercent,
    };
    return NextResponse.json({
      product: buildProductView(product, settings.pisCofinsPercent, undefined, companyTaxContext),
      pisCofinsPercent: settings.pisCofinsPercent,
      taxRegime: settings.taxRegime,
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
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

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
    const settings = await ensureCompanySettings(organizationId);
    const data = productPatchToPrismaData(parsed);
    const product = await prisma.product.update({
      where: { organizationId_sku: { organizationId, sku } },
      data,
    });
    return NextResponse.json({
      product: buildProductView(product, settings.pisCofinsPercent, undefined, {
        taxRegime: settings.taxRegime,
        simplesAliquotaEfetivaPercent: settings.simplesAliquotaEfetivaPercent,
      }),
    });
  } catch (e) {
    logServerError("api/products/[sku] PATCH", e);
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

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  try {
    await prisma.product.delete({
      where: { organizationId_sku: { organizationId, sku } },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/products/[sku] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "product_delete_failed"), {
      status: 502,
    });
  }
}
