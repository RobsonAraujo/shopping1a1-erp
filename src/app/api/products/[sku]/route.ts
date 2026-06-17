import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  buildProductView,
  ensureCompanyTaxSettings,
  productWriteToPrismaData,
  validateProductInput,
  type ProductWriteInput,
} from "@/lib/product-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ sku: string }> };

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return true;
}

function parseProductBody(body: Record<string, unknown>): ProductWriteInput | "invalid" {
  const sku = typeof body.sku === "string" ? body.sku : "";
  const ncm = typeof body.ncm === "string" ? body.ncm : null;
  const unitCostNf = Number(body.unitCostNf);
  const purchaseIcmsPercent = Number(body.purchaseIcmsPercent);
  const hasIcmsSt = body.hasIcmsSt === true;
  const purchaseCostWithSt =
    body.purchaseCostWithSt === null || body.purchaseCostWithSt === undefined
      ? null
      : Number(body.purchaseCostWithSt);
  const ipiPercent = Number(body.ipiPercent ?? 0);
  const extraCosts = Number(body.extraCosts ?? 0);
  const isMonophasic = body.isMonophasic === true;
  const saleIcmsPercent = Number(body.saleIcmsPercent);

  if (
    !sku ||
    !Number.isFinite(unitCostNf) ||
    !Number.isFinite(purchaseIcmsPercent) ||
    !Number.isFinite(saleIcmsPercent)
  ) {
    return "invalid";
  }

  return {
    sku,
    ncm,
    unitCostNf,
    purchaseIcmsPercent,
    hasIcmsSt,
    purchaseCostWithSt,
    ipiPercent: Number.isFinite(ipiPercent) ? ipiPercent : 0,
    extraCosts: Number.isFinite(extraCosts) ? extraCosts : 0,
    isMonophasic,
    saleIcmsPercent,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  try {
    const pisCofinsPercent = await ensureCompanyTaxSettings();
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({
      product: buildProductView(product, pisCofinsPercent),
      pisCofinsPercent,
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseProductBody({ ...body, sku });
  if (parsed === "invalid") {
    return NextResponse.json({ error: "Invalid product payload" }, { status: 400 });
  }

  const validationError = validateProductInput(parsed);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const pisCofinsPercent = await ensureCompanyTaxSettings();
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
        saleIcmsPercent: data.saleIcmsPercent,
      },
    });
    return NextResponse.json({
      product: buildProductView(product, pisCofinsPercent),
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
