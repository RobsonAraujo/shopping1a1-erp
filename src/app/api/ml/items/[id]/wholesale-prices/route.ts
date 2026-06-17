import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { buildNetWholesalePricesPayload } from "@/lib/mercadolibre/build-net-wholesale-prices-payload";
import {
  eligibilityErrorMessage,
  fetchItemPrices,
  fetchNetPriceEligibility,
  updateItemNetQuantityPrices,
} from "@/lib/mercadolibre/item-quantity-prices";
import { siteIdFromItemId } from "@/lib/mercadolibre/listing-fees";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { ensureCompanySettings } from "@/lib/product-data";
import { loadFinancialEvaluationRows } from "@/lib/financial-evaluation-data";
import {
  computeWholesalePricesForListing,
  wholesaleReductionsToTuple,
} from "@/lib/wholesale-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

type RouteContext = { params: Promise<{ id: string }> };

type PostBody = {
  levels?: number[];
};

function itemOwnedByUser(item: ItemBody, userId: number): boolean {
  return item.seller_id === userId;
}

function parseLevels(body: PostBody): Array<1 | 2 | 3> | null {
  if (!body.levels || body.levels.length === 0) {
    return [1, 2, 3];
  }
  const parsed = [...new Set(body.levels)]
    .map((n) => Number(n))
    .filter((n): n is 1 | 2 | 3 => n === 1 || n === 2 || n === 3);
  if (parsed.length === 0) return null;
  return parsed.sort((a, b) => a - b);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: mlItemId } = await context.params;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as PostBody;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const levels = parseLevels(body);
  if (!levels) {
    return NextResponse.json(
      { error: "levels deve conter 1, 2 e/ou 3" },
      { status: 400 },
    );
  }

  try {
    const item = await fetchItemById(token, mlItemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.seller_id === undefined || !itemOwnedByUser(item, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [companySettings, rows] = await Promise.all([
      ensureCompanySettings(),
      loadFinancialEvaluationRows(token, userId, { itemIds: [mlItemId] }),
    ]);

    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Anúncio indisponível para lucratividade." },
        { status: 404 },
      );
    }

    const wholesaleLevels = computeWholesalePricesForListing({
      salePrice: row.salePrice,
      mlFeeAmount: row.mlFeeAmount,
      mlFeeRebate: row.mlFeeRebate,
      shippingCost: row.shippingCost,
      productCost: row.productCost,
      extraCosts: row.extraCosts,
      currentMarginPercent: row.breakdown?.marginPercent ?? null,
      currentMarginValue: row.breakdown?.marginValue ?? null,
      reductions: wholesaleReductionsToTuple(companySettings),
    });

    const minQtyByLevel: Record<1 | 2 | 3, number> = {
      1: companySettings.level1MinPurchaseUnit,
      2: companySettings.level2MinPurchaseUnit,
      3: companySettings.level3MinPurchaseUnit,
    };

    const tiers = levels
      .map((level) => {
        const computed = wholesaleLevels[level - 1];
        if (
          !computed ||
          computed.suggestedPrice === null ||
          computed.reason !== "ok"
        ) {
          return null;
        }
        return {
          level,
          minPurchaseUnit: minQtyByLevel[level],
          netAmount: computed.suggestedPrice,
        };
      })
      .filter((tier): tier is NonNullable<typeof tier> => tier !== null);

    if (tiers.length === 0) {
      return NextResponse.json(
        {
          error:
            "Não há preços atacado válidos para aplicar. Verifique custos e margem do anúncio.",
        },
        { status: 422 },
      );
    }

    const siteId = siteIdFromItemId(mlItemId);
    const eligibility = await fetchNetPriceEligibility(
      token,
      siteId,
      userId,
      mlItemId,
    );
    const eligibilityError = eligibilityErrorMessage(eligibility);
    if (eligibilityError) {
      return NextResponse.json({ error: eligibilityError }, { status: 422 });
    }

    const currentPrices = await fetchItemPrices(token, mlItemId);
    const payload = buildNetWholesalePricesPayload({
      retailUnitPrice: row.salePrice,
      currencyId: item.currency_id ?? "BRL",
      tiers,
      currentPrices: currentPrices.prices,
      replaceAllBusinessTiers: levels.length === 3,
    });

    const updated = await updateItemNetQuantityPrices(
      token,
      mlItemId,
      payload,
    );

    return NextResponse.json({
      ok: true,
      mlItemId,
      appliedLevels: tiers.map((t) => t.level),
      tiers: tiers.map((t) => ({
        level: t.level,
        minPurchaseUnit: t.minPurchaseUnit,
        netAmount: t.netAmount,
      })),
      prices: updated.prices,
    });
  } catch (e) {
    logServerError("api/ml/items wholesale-prices POST", e);
    const message = e instanceof Error ? e.message : "apply_wholesale_failed";
    const status =
      message.includes("elegib") ||
      message.includes("inválid") ||
      message.includes("Não há preços")
        ? 422
        : 502;
    return NextResponse.json(apiErrorPayload(e, "apply_wholesale_failed"), {
      status,
    });
  }
}
