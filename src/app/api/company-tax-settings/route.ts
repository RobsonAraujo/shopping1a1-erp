import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  ensureCompanySettings,
  validateWholesaleReductionPercent,
  type CompanySettings,
} from "@/lib/product-data";
import { DEFAULT_PIS_COFINS_PERCENT } from "@/lib/product-pricing";
import {
  validateWholesaleMinPurchaseUnit,
  validateWholesaleReductionSettings,
  type WholesaleReductionSettings,
} from "@/lib/wholesale-pricing";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return true;
}

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
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await ensureCompanySettings();
    return NextResponse.json(settingsResponse(settings));
  } catch (e) {
    logServerError("api/company-tax-settings GET", e);
    return NextResponse.json(apiErrorPayload(e, "tax_settings_load_failed"), {
      status: 502,
    });
  }
}

type PatchBody = {
  pisCofinsPercent?: unknown;
  wholesaleReductions?: {
    level1ReductionPercent?: unknown;
    level2ReductionPercent?: unknown;
    level3ReductionPercent?: unknown;
    level1MinPurchaseUnit?: unknown;
    level2MinPurchaseUnit?: unknown;
    level3MinPurchaseUnit?: unknown;
  };
};

export async function PATCH(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = await ensureCompanySettings();

  let pisCofinsPercent = current.pisCofinsPercent;
  if (body.pisCofinsPercent !== undefined) {
    const n = Number(body.pisCofinsPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json(
        { error: "pisCofinsPercent must be between 0 and 100" },
        { status: 400 },
      );
    }
    pisCofinsPercent = n;
  }

  let level1 = current.level1ReductionPercent;
  let level2 = current.level2ReductionPercent;
  let level3 = current.level3ReductionPercent;
  let min1 = current.level1MinPurchaseUnit;
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
      const err = validateWholesaleMinPurchaseUnit(level1MinPurchaseUnit);
      if (err) {
        return NextResponse.json({ error: `Nível 1: ${err}` }, { status: 400 });
      }
      min1 = Number(level1MinPurchaseUnit);
    }
    if (level2MinPurchaseUnit !== undefined) {
      const err = validateWholesaleMinPurchaseUnit(level2MinPurchaseUnit);
      if (err) {
        return NextResponse.json({ error: `Nível 2: ${err}` }, { status: 400 });
      }
      min2 = Number(level2MinPurchaseUnit);
    }
    if (level3MinPurchaseUnit !== undefined) {
      const err = validateWholesaleMinPurchaseUnit(level3MinPurchaseUnit);
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
      where: { id: "default" },
      create: {
        pisCofinsPercent: pisCofinsPercent ?? DEFAULT_PIS_COFINS_PERCENT,
        wholesaleLevel1ReductionPercent: level1,
        wholesaleLevel2ReductionPercent: level2,
        wholesaleLevel3ReductionPercent: level3,
        wholesaleLevel1MinPurchaseUnit: min1,
        wholesaleLevel2MinPurchaseUnit: min2,
        wholesaleLevel3MinPurchaseUnit: min3,
      },
      update: {
        pisCofinsPercent,
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
