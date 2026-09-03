import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/db";
import {
  ensureCompanySettings,
  validateWholesaleReductionPercent,
  type CompanySettings,
} from "@/lib/products/product-data";
import { DEFAULT_PIS_COFINS_PERCENT } from "@/lib/pricing/product-pricing";
import {
  validateWholesaleDiscountMinPurchaseUnit,
  validateWholesaleReductionSettings,
  WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT,
  type WholesaleReductionSettings,
} from "@/lib/pricing/wholesale-pricing";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

function wholesaleReductionsResponse(
  settings: Pick<
    WholesaleReductionSettings,
    | "level1ReductionPercent"
    | "level2ReductionPercent"
    | "level3ReductionPercent"
    | "level1MinPurchaseUnit"
    | "level2MinPurchaseUnit"
    | "level3MinPurchaseUnit"
  >,
) {
  return {
    level1ReductionPercent: settings.level1ReductionPercent,
    level2ReductionPercent: settings.level2ReductionPercent,
    level3ReductionPercent: settings.level3ReductionPercent,
    level1MinPurchaseUnit: settings.level1MinPurchaseUnit,
    level2MinPurchaseUnit: settings.level2MinPurchaseUnit,
    level3MinPurchaseUnit: settings.level3MinPurchaseUnit,
  };
}

function settingsResponse(settings: CompanySettings) {
  return {
    pisCofinsPercent: settings.pisCofinsPercent,
    wholesaleReductions: wholesaleReductionsResponse(settings),
  };
}

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const settings = await ensureCompanySettings(auth.ctx.organizationId);
    return NextResponse.json(settingsResponse(settings));
  } catch (e) {
    logServerError("api/company-tax-settings GET", e);
    return NextResponse.json(apiErrorPayload(e, "tax_settings_load_failed"), {
      status: 502,
    });
  }
}

const patchBodySchema = z.object({
  wholesaleReductions: z
    .object({
      level1ReductionPercent: z.unknown().optional(),
      level2ReductionPercent: z.unknown().optional(),
      level3ReductionPercent: z.unknown().optional(),
      level1MinPurchaseUnit: z.unknown().optional(),
      level2MinPurchaseUnit: z.unknown().optional(),
      level3MinPurchaseUnit: z.unknown().optional(),
    })
    .optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, patchBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const current = await ensureCompanySettings(organizationId);

  let level1 = current.level1ReductionPercent;
  let level2 = current.level2ReductionPercent;
  let level3 = current.level3ReductionPercent;
  let min1 = WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT;
  let min2 = current.level2MinPurchaseUnit;
  let min3 = current.level3MinPurchaseUnit;

  if (body.wholesaleReductions) {
    const {
      level1ReductionPercent,
      level2ReductionPercent,
      level3ReductionPercent,
      level1MinPurchaseUnit,
      level2MinPurchaseUnit,
      level3MinPurchaseUnit,
    } = body.wholesaleReductions;

    if (level1ReductionPercent !== undefined) {
      const err = validateWholesaleReductionPercent(level1ReductionPercent);
      if (err) {
        return NextResponse.json({ error: `Nível 1: ${err}` }, { status: 400 });
      }
      level1 = Number(level1ReductionPercent);
    }
    if (level2ReductionPercent !== undefined) {
      const err = validateWholesaleReductionPercent(level2ReductionPercent);
      if (err) {
        return NextResponse.json({ error: `Nível 2: ${err}` }, { status: 400 });
      }
      level2 = Number(level2ReductionPercent);
    }
    if (level3ReductionPercent !== undefined) {
      const err = validateWholesaleReductionPercent(level3ReductionPercent);
      if (err) {
        return NextResponse.json({ error: `Nível 3: ${err}` }, { status: 400 });
      }
      level3 = Number(level3ReductionPercent);
    }
    if (level1MinPurchaseUnit !== undefined) {
      const n = Number(level1MinPurchaseUnit);
      if (!Number.isInteger(n) || n !== WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT) {
        return NextResponse.json(
          { error: "Nível 1 (âncora): quantidade mínima deve ser 1 unidade" },
          { status: 400 },
        );
      }
      min1 = WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT;
    }
    if (level2MinPurchaseUnit !== undefined) {
      const err = validateWholesaleDiscountMinPurchaseUnit(level2MinPurchaseUnit);
      if (err) {
        return NextResponse.json({ error: `Nível 2: ${err}` }, { status: 400 });
      }
      min2 = Number(level2MinPurchaseUnit);
    }
    if (level3MinPurchaseUnit !== undefined) {
      const err = validateWholesaleDiscountMinPurchaseUnit(level3MinPurchaseUnit);
      if (err) {
        return NextResponse.json({ error: `Nível 3: ${err}` }, { status: 400 });
      }
      min3 = Number(level3MinPurchaseUnit);
    }

    const qtyErr = validateWholesaleReductionSettings({
      level1ReductionPercent: level1,
      level2ReductionPercent: level2,
      level3ReductionPercent: level3,
      level1MinPurchaseUnit: min1,
      level2MinPurchaseUnit: min2,
      level3MinPurchaseUnit: min3,
    });
    if (qtyErr) {
      return NextResponse.json({ error: qtyErr }, { status: 400 });
    }
  }

  try {
    const row = await prisma.companyTaxSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        pisCofinsPercent: current.pisCofinsPercent ?? DEFAULT_PIS_COFINS_PERCENT,
        wholesaleLevel1ReductionPercent: level1,
        wholesaleLevel2ReductionPercent: level2,
        wholesaleLevel3ReductionPercent: level3,
        wholesaleLevel1MinPurchaseUnit: min1,
        wholesaleLevel2MinPurchaseUnit: min2,
        wholesaleLevel3MinPurchaseUnit: min3,
      },
      update: {
        wholesaleLevel1ReductionPercent: level1,
        wholesaleLevel2ReductionPercent: level2,
        wholesaleLevel3ReductionPercent: level3,
        wholesaleLevel1MinPurchaseUnit: min1,
        wholesaleLevel2MinPurchaseUnit: min2,
        wholesaleLevel3MinPurchaseUnit: min3,
      },
    });

    return NextResponse.json(
      settingsResponse({
        pisCofinsPercent: Number(row.pisCofinsPercent),
        taxRegime: row.taxRegime,
        simplesAliquotaEfetivaPercent:
          row.simplesAliquotaEfetivaPercent != null
            ? Number(row.simplesAliquotaEfetivaPercent)
            : null,
        level1ReductionPercent: Number(row.wholesaleLevel1ReductionPercent),
        level2ReductionPercent: Number(row.wholesaleLevel2ReductionPercent),
        level3ReductionPercent: Number(row.wholesaleLevel3ReductionPercent),
        level1MinPurchaseUnit: row.wholesaleLevel1MinPurchaseUnit,
        level2MinPurchaseUnit: row.wholesaleLevel2MinPurchaseUnit,
        level3MinPurchaseUnit: row.wholesaleLevel3MinPurchaseUnit,
      }),
    );
  } catch (e) {
    logServerError("api/company-tax-settings PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "tax_settings_update_failed"), {
      status: 502,
    });
  }
}
