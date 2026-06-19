import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSkuAlias,
  listAliasesForCanonicalSku,
} from "@/lib/product-sku-alias-data";
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

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sku: skuParam } = await context.params;
  const canonicalSku = normalizeProductSku(decodeURIComponent(skuParam));

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const aliasSku =
    typeof body.aliasSku === "string"
      ? normalizeProductSku(body.aliasSku)
      : "";
  if (!aliasSku) {
    return NextResponse.json({ error: "aliasSku é obrigatório" }, { status: 400 });
  }

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
