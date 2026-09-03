import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import {
  buildProductView,
  ensureCompanySettings,
  listingImageUrlForSku,
  loadListingImageUrlsBySku,
  productWriteToPrismaData,
  validateProductInput,
} from "@/lib/products/product-data";
import { loadProductTaxFromLatestReport } from "@/lib/products/product-tax-from-report";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

const productWriteSchema = z.object({
  mlItemId: z.string().trim().min(1, "Selecione um anúncio do Mercado Livre"),
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
    const skus = products
      .map((p) => p.sku)
      .filter((s): s is string => s !== null);
    const imageUrlsBySku = await loadListingImageUrlsBySku(organizationId, skus);
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
          p.sku ? (imageUrlsBySku.get(p.sku) ?? null) : null,
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
  const { token, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, productWriteSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parsedBody.data;

  const item = await fetchItemById(token, parsed.mlItemId);
  if (!item) {
    return NextResponse.json(
      { error: "Anúncio não encontrado no Mercado Livre" },
      { status: 404 },
    );
  }

  const input = { ...parsed, sku: getItemSku(item) ?? "" };
  const validationError = validateProductInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const settings = await ensureCompanySettings(organizationId);
    const data = productWriteToPrismaData(organizationId, input);
    const product = await prisma.product.create({ data });

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
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Este anúncio já está cadastrado como produto" },
        { status: 409 },
      );
    }
    logServerError("api/products POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_create_failed"), {
      status: 502,
    });
  }
}
