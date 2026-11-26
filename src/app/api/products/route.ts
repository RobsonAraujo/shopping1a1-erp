import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
import {
  buildProductView,
  ensureCompanySettings,
  listingImageUrlForMlItemId,
  loadListingImageUrlsByMlItemId,
  productWriteToPrismaData,
  validateProductInput,
} from "@/lib/products/product-data";
import {
  emptyProductTaxLookup,
  loadProductTaxRolling30d,
} from "@/lib/products/product-tax-from-report";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { loadListingGroups } from "@/lib/products/listing-groups";
import {
  cadastroBlockedMessage,
  linkAfterCadastro,
  pendingOptionCadastros,
  productOptionsView,
} from "@/lib/products/product-options";

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
  supplierId: z.string().trim().nullable().optional(),
  icmsIncentiveExcluded: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { userId, organizationId } = auth.ctx;

  try {
    const settingsPromise = ensureCompanySettings(organizationId);
    const [settings, allProducts, groups, taxFromReport] = await Promise.all([
      settingsPromise,
      prisma.product.findMany({
        where: { organizationId },
        orderBy: { sku: "asc" },
        include: { supplier: { select: { id: true, name: true } } },
      }),
      loadListingGroups(organizationId),
      // No Simples o imposto é a alíquota única da empresa: não lê o Tributário.
      settingsPromise.then((s) =>
        s.taxRegime === "SIMPLES"
          ? emptyProductTaxLookup()
          : loadProductTaxRolling30d(organizationId, userId),
      ),
    ]);
    // Um produto por linha: o cadastro de uma opção de venda (outro MLB do
    // mesmo produto físico) aparece dentro do principal, como "cadastro
    // duplicado", e não como produto à parte.
    const products = allProducts.filter((p) => !groups.isOption(p.mlItemId));
    const imageUrlsByMlItemId = await loadListingImageUrlsByMlItemId(
      organizationId,
      products.map((p) => p.mlItemId),
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
      taxWindow: taxFromReport.window,
      products: products.map((p) => ({
        ...buildProductView(
          p,
          settings.pisCofinsPercent,
          taxFromReport,
          companyTaxContext,
          imageUrlsByMlItemId.get(p.mlItemId) ?? null,
          p.supplier,
        ),
        options: productOptionsView(groups, p.mlItemId),
      })),
      duplicateOptionCount: allProducts.length - products.length,
      pendingDuplicateOptionCount: pendingOptionCadastros(groups).length,
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

  // Opção de venda de um produto já cadastrado: o cadastro do principal já
  // vale para ela (o UP vem do corpo do anúncio, mesmo se o ERP ainda não o viu).
  const groups = await loadListingGroups(organizationId, { extraItems: [item] });
  const blocked = cadastroBlockedMessage(groups, item);
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 409 });
  }

  try {
    const settings = await ensureCompanySettings(organizationId);
    const data = productWriteToPrismaData(organizationId, input);
    const product = await prisma.product.create({
      data,
      include: { supplier: { select: { id: true, name: true } } },
    });

    // Este anúncio vira o principal do produto (o cadastro vale para as
    // opções). Falhar aqui não desfaz o cadastro: a rodada de vínculo completa.
    try {
      await linkAfterCadastro(organizationId, [item]);
    } catch (e) {
      logServerError("api/products POST linkAfterCadastro", e);
    }
    const [imageUrl, groupsAfter] = await Promise.all([
      listingImageUrlForMlItemId(organizationId, product.mlItemId),
      loadListingGroups(organizationId),
    ]);
    return NextResponse.json({
      product: {
        ...buildProductView(
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
        options: productOptionsView(groupsAfter, product.mlItemId),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Este anúncio já está cadastrado como produto" },
        { status: 409 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Fornecedor selecionado não existe" },
        { status: 400 },
      );
    }
    logServerError("api/products POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_create_failed"), {
      status: 502,
    });
  }
}
