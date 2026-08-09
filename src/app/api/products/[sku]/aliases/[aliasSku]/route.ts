import { NextRequest, NextResponse } from "next/server";
import {
  deleteSkuAlias,
  listAliasesForCanonicalSku,
} from "@/lib/product-sku-alias-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ sku: string; aliasSku: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorizedResponse();
  }

  const { sku: skuParam, aliasSku: aliasParam } = await context.params;
  const canonicalSku = normalizeProductSku(decodeURIComponent(skuParam));
  const aliasSku = normalizeProductSku(decodeURIComponent(aliasParam));

  try {
    const removed = await deleteSkuAlias({ canonicalSku, aliasSku });
    if (!removed) {
      return NextResponse.json({ error: "Alias não encontrado" }, { status: 404 });
    }
    const aliases = await listAliasesForCanonicalSku(canonicalSku);
    return NextResponse.json({ aliases });
  } catch (e) {
    logServerError("api/products/[sku]/aliases/[aliasSku] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "product_alias_delete_failed"), {
      status: 502,
    });
  }
}
