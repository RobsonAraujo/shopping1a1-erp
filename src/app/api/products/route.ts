import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  buildProductView,
  ensureCompanySettings,
  productWriteToPrismaData,
  validateProductInput,
  type ProductWriteInput,
} from "@/lib/product-data";
import { loadProductTaxFromLatestReport } from "@/lib/product-tax-from-report";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return { token, userId };
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

export async function GET() {
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [settings, products, taxFromReport] = await Promise.all([
      ensureCompanySettings(),
      prisma.product.findMany({ orderBy: { sku: "asc" } }),
      loadProductTaxFromLatestReport(auth.userId),
    ]);
    return NextResponse.json({
      pisCofinsPercent: settings.pisCofinsPercent,
      taxReportGeneratedAt: taxFromReport.generatedAt,
      products: products.map((p) =>
        buildProductView(p, settings.pisCofinsPercent, taxFromReport),
      ),
    });
  } catch (e) {
    logServerError("api/products GET", e);
    return NextResponse.json(apiErrorPayload(e, "products_load_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseProductBody(body);
  if (parsed === "invalid") {
    return NextResponse.json({ error: "Invalid product payload" }, { status: 400 });
  }

  const validationError = validateProductInput(parsed);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const settings = await ensureCompanySettings();
    const data = productWriteToPrismaData(parsed);
    const product = await prisma.product.create({ data });
    return NextResponse.json({
      product: buildProductView(product, settings.pisCofinsPercent),
    });
  } catch (e) {
    logServerError("api/products POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_create_failed"), {
      status: 502,
    });
  }
}
