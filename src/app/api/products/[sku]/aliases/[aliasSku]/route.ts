import { NextRequest, NextResponse } from "next/server";
import {
  deleteSkuAlias,
  listAliasesForCanonicalSku,
} from "@/lib/product-sku-alias-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ sku: string; aliasSku: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const { sku: skuParam, aliasSku: aliasParam } = await context.params;
  const canonicalSku = normalizeProductSku(decodeURIComponent(skuParam));
  const aliasSku = normalizeProductSku(decodeURIComponent(aliasParam));

  try {
    const removed = await deleteSkuAlias(organizationId, { canonicalSku, aliasSku });
    if (!removed) {
      return NextResponse.json({ error: "Alias não encontrado" }, { status: 404 });
    }
    const aliases = await listAliasesForCanonicalSku(organizationId, canonicalSku);
    return NextResponse.json({ aliases });
  } catch (e) {
    logServerError("api/products/[sku]/aliases/[aliasSku] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "product_alias_delete_failed"), {
      status: 502,
    });
  }
}
