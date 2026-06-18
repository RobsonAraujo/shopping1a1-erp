import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  listCbsIbsVigencia,
  listIcmsInternalRates,
  loadTaxCompanyConfig,
  updateTaxCompanyConfig,
  upsertCbsIbsVigencia,
  upsertIcmsInternalRate,
} from "@/lib/tax-report/tax-config-data";
import type { TaxCompanyConfig } from "@/lib/tax-report/types";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import {
  getValidAccessToken,
  readSession,
} from "@/lib/mercadolibre/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [company, icmsRates, cbsIbs] = await Promise.all([
      loadTaxCompanyConfig(),
      listIcmsInternalRates(),
      listCbsIbsVigencia(),
    ]);
    return NextResponse.json({ company, icmsRates, cbsIbs });
  } catch (e) {
    logServerError("api/tax-config GET", e);
    return NextResponse.json(apiErrorPayload(e, "tax_config_load_failed"), {
      status: 502,
    });
  }
}

type PatchBody = {
  company?: Partial<TaxCompanyConfig>;
  icmsRate?: { uf: string; aliquotaBase: number; fcp: number };
  cbsIbs?: {
    year: number;
    cbsRate: number | null;
    ibsEstadualRate: number | null;
    ibsMunicipalRate: number | null;
    notes?: string | null;
  };
};

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.company) {
      await updateTaxCompanyConfig(body.company);
    }
    if (body.icmsRate) {
      await upsertIcmsInternalRate(body.icmsRate);
    }
    if (body.cbsIbs) {
      await upsertCbsIbsVigencia({
        ...body.cbsIbs,
        notes: body.cbsIbs.notes ?? null,
      });
    }

    const [company, icmsRates, cbsIbs] = await Promise.all([
      loadTaxCompanyConfig(),
      listIcmsInternalRates(),
      listCbsIbsVigencia(),
    ]);
    return NextResponse.json({ company, icmsRates, cbsIbs });
  } catch (e) {
    logServerError("api/tax-config PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "tax_config_save_failed"), {
      status: 502,
    });
  }
}
