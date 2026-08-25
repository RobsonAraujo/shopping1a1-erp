import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  buildProductView,
  ensureCompanySettings,
  listingImageUrlForSku,
  loadListingImageUrlsBySku,
  productWriteToPrismaData,
  validateProductInput,
} from "@/lib/product-data";
import { loadProductTaxFromLatestReport } from "@/lib/product-tax-from-report";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const productWriteSchema = z.object({
  sku: z.string().min(1, "SKU é obrigatório"),
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

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { userId, organizationId } = auth.ctx;

  try {
    const [settings, products, taxFromReport] = await Promise.all([
      ensureCompanySettings(organizationId),
      prisma.product.findMany({ where: { organizationId }, orderBy: { sku: "asc" } }),
      loadProductTaxFromLatestReport(userId),
    ]);
    const imageUrlsBySku = await loadListingImageUrlsBySku(
      organizationId,
      products.map((p) => p.sku),
    );
    const companyTaxContext = {
      taxRegime: settings.taxRegime,
      simplesAliquotaEfetivaPercent: settings.simplesAliquotaEfetivaPercent,
    };
    return NextResponse.json({
      pisCofinsPercent: settings.pisCofinsPercent,
      taxRegime: settings.taxRegime,
      simplesAliquotaEfetivaPercent: settings.simplesAliquotaEfetivaPercent,
      taxReportGeneratedAt: taxFromReport.generatedAt,
      products: products.map((p) =>
        buildProductView(
          p,
          settings.pisCofinsPercent,
          taxFromReport,
          companyTaxContext,
          imageUrlsBySku.get(p.sku) ?? null,
        ),
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
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, productWriteSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parsedBody.data;

  const validationError = validateProductInput(parsed);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const settings = await ensureCompanySettings(organizationId);
    const data = productWriteToPrismaData(organizationId, parsed);
    const product = await prisma.product.create({ data });
    const imageUrl = await listingImageUrlForSku(organizationId, product.sku);
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
    });
  } catch (e) {
    logServerError("api/products POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_create_failed"), {
      status: 502,
    });
  }
}
