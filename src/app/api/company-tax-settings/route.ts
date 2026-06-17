import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { DEFAULT_PIS_COFINS_PERCENT } from "@/lib/product-pricing";
import { ensureCompanyTaxSettings } from "@/lib/product-data";
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

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pisCofinsPercent = await ensureCompanyTaxSettings();
    return NextResponse.json({ pisCofinsPercent });
  } catch (e) {
    logServerError("api/company-tax-settings GET", e);
    return NextResponse.json(apiErrorPayload(e, "tax_settings_load_failed"), {
      status: 502,
    });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { pisCofinsPercent?: unknown };
  try {
    body = (await request.json()) as { pisCofinsPercent?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pisCofinsPercent = Number(body.pisCofinsPercent);
  if (!Number.isFinite(pisCofinsPercent) || pisCofinsPercent < 0 || pisCofinsPercent > 100) {
    return NextResponse.json(
      { error: "pisCofinsPercent must be between 0 and 100" },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.companyTaxSettings.upsert({
      where: { id: "default" },
      create: { pisCofinsPercent },
      update: { pisCofinsPercent },
    });
    return NextResponse.json({
      pisCofinsPercent: Number(row.pisCofinsPercent),
    });
  } catch (e) {
    logServerError("api/company-tax-settings PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "tax_settings_update_failed"), {
      status: 502,
    });
  }
}
