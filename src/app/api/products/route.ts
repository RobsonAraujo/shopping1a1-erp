import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  buildProductView,
  ensureCompanySettings,
  productWriteToPrismaData,
  validateProductInput,
} from "@/lib/product-data";
import { loadProductTaxFromLatestReport } from "@/lib/product-tax-from-report";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const productWriteSchema = z.object({
  sku: z.string().min(1, "SKU é obrigatório"),
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

export async function GET() {
  const auth = await requireAuth();
  if (!auth) {
    return unauthorizedResponse();
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
    return unauthorizedResponse();
  }

  const parsedBody = await parseJsonBody(request, productWriteSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parsedBody.data;

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
