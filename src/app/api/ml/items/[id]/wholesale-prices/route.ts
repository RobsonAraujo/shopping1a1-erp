import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchItemById } from "@/lib/mercadolibre/api";
import { buildNetWholesalePricesPayload } from "@/lib/mercadolibre/build-net-wholesale-prices-payload";
import {
  eligibilityErrorMessage,
  fetchItemPrices,
  fetchNetPriceEligibility,
  resolveMlAnchorNetAmount,
  splitBusinessPrices,
  updateItemNetQuantityPrices,
} from "@/lib/mercadolibre/item-quantity-prices";
import { siteIdFromItemId } from "@/lib/mercadolibre/listing-fees";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { ensureCompanySettings } from "@/lib/products/product-data";
import { loadFinancialEvaluationRows } from "@/lib/lucratividade/financial-evaluation-data";
import {
  computeWholesalePricesForListing,
  mlDiscountMinPurchaseUnitForLevel,
  wholesaleReductionsToTuple,
} from "@/lib/pricing/wholesale-pricing";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

const postBodySchema = z.object({
  levels: z
    .array(z.union([z.literal(1), z.literal(2), z.literal(3)]))
    .optional(),
});

function itemOwnedByUser(item: ItemBody, userId: number): boolean {
  return item.seller_id === userId;
}

function normalizeLevels(levels: number[] | undefined): Array<1 | 2 | 3> {
  if (!levels || levels.length === 0) return [1, 2, 3];
  return [...new Set(levels)].sort((a, b) => a - b) as Array<1 | 2 | 3>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: mlItemId } = await context.params;
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const text = await request.text();
  let rawBody: unknown = {};
  if (text.trim()) {
    try {
      rawBody = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }
  const parsedResult = postBodySchema.safeParse(rawBody);
  if (!parsedResult.success) {
    return NextResponse.json(
      { error: "levels deve conter 1, 2 e/ou 3" },
      { status: 400 },
    );
  }
  const levels = normalizeLevels(parsedResult.data.levels);

  try {
    const item = await fetchItemById(token, mlItemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.seller_id === undefined || !itemOwnedByUser(item, userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [companySettings, rows] = await Promise.all([
      ensureCompanySettings(organizationId),
      loadFinancialEvaluationRows(token, userId, organizationId, {
        itemIds: [mlItemId],
      }),
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

    const level1Computed = wholesaleLevels[0];
    const level1Valid =
      level1Computed !== undefined &&
      level1Computed.suggestedPrice !== null &&
      level1Computed.reason === "ok";

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
    const { anchor: existingAnchor, discountTiers: existingDiscountTiers } =
      splitBusinessPrices(currentPrices.prices);

    const hasLevel1Apply = levels.includes(1) && level1Valid;
    const anchorNetAmount = hasLevel1Apply
      ? level1Computed.suggestedPrice!
      : (existingAnchor?.netAmount ??
        resolveMlAnchorNetAmount(currentPrices.prices, row.salePrice));

    const discountTiers = ([2, 3] as const)
      .map((level) => {
        const minPurchaseUnit = mlDiscountMinPurchaseUnitForLevel(
          level,
          companySettings,
        );
        if (levels.includes(level)) {
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
            minPurchaseUnit,
            netAmount: computed.suggestedPrice,
          };
        }
        const existing = existingDiscountTiers.find(
          (tier) => tier.minPurchaseUnit === minPurchaseUnit,
        );
        if (!existing) {
          return null;
        }
        return {
          level,
          minPurchaseUnit,
          netAmount: existing.netAmount,
        };
      })
      .filter((tier): tier is NonNullable<typeof tier> => tier !== null)
      .sort((a, b) => a.minPurchaseUnit - b.minPurchaseUnit);

    if (!hasLevel1Apply && discountTiers.length === 0) {
      return NextResponse.json(
        {
          error:
            "Não há preços atacado válidos para aplicar. Verifique custos e margem do anúncio.",
        },
        { status: 422 },
      );
    }

    const payload = buildNetWholesalePricesPayload({
      anchorNetAmount,
      currencyId: item.currency_id ?? "BRL",
      tiers: discountTiers,
      currentPrices: currentPrices.prices,
      replaceAllBusinessTiers: true,
    });

    const updated = await updateItemNetQuantityPrices(
      token,
      mlItemId,
      payload,
    );

    const { discountTiers: confirmed } = splitBusinessPrices(updated.prices);

    return NextResponse.json({
      ok: true,
      mlItemId,
      anchor: {
        minPurchaseUnit: 1,
        netAmount: anchorNetAmount,
        note: hasLevel1Apply
          ? "Âncora ML (nível 1 — preço sugerido)"
          : "Âncora ML (preço vigente no anúncio)",
      },
      level1Applied: hasLevel1Apply,
      tiers: discountTiers.map((t) => ({
        level: t.level,
        minPurchaseUnit: t.minPurchaseUnit,
        netAmount: t.netAmount,
      })),
      confirmed,
    });
  } catch (e) {
    logServerError("api/ml/items wholesale-prices POST", e);
    const message = e instanceof Error ? e.message : "apply_wholesale_failed";
    const isValidationError =
      message.includes("elegib") ||
      message.includes("inválid") ||
      message.includes("Não há preços") ||
      message.includes("Price validation");

    const status = isValidationError ? 422 : 502;

    return NextResponse.json(
      apiErrorPayload(
        e instanceof Error ? new Error(message) : e,
        "apply_wholesale_failed",
      ),
      { status },
    );
  }
}
