import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSkuAlias,
  listAliasesForCanonicalSku,
} from "@/lib/product-sku-alias-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ sku: string }> };

const createAliasSchema = z.object({
  aliasSku: z
    .string()
    .transform(normalizeProductSku)
    .refine((v) => v.length > 0, "aliasSku é obrigatório"),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { sku: skuParam } = await context.params;
  const sku = normalizeProductSku(decodeURIComponent(skuParam));

  try {
    const aliases = await listAliasesForCanonicalSku(sku);
    return NextResponse.json({ aliases });
  } catch (e) {
    logServerError("api/products/[sku]/aliases GET", e);
    return NextResponse.json(apiErrorPayload(e, "product_aliases_load_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { sku: skuParam } = await context.params;
  const canonicalSku = normalizeProductSku(decodeURIComponent(skuParam));

  const parsedBody = await parseJsonBody(request, createAliasSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { aliasSku } = parsedBody.data;

  try {
    const result = await createSkuAlias({ canonicalSku, aliasSku });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const aliases = await listAliasesForCanonicalSku(canonicalSku);
    return NextResponse.json({ aliases, aliasSku: result.aliasSku });
  } catch (e) {
    logServerError("api/products/[sku]/aliases POST", e);
    return NextResponse.json(apiErrorPayload(e, "product_alias_create_failed"), {
      status: 502,
    });
  }
}
