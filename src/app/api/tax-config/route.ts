import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listCbsIbsVigencia,
  listIcmsInternalRates,
  loadTaxCompanyConfig,
  updateTaxCompanyConfig,
  upsertCbsIbsVigencia,
  upsertIcmsInternalRate,
} from "@/lib/tax-report/tax-config-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const [company, icmsRates, cbsIbs] = await Promise.all([
      loadTaxCompanyConfig(auth.ctx.organizationId),
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

const patchBodySchema = z.object({
  company: z
    .object({
      taxRegime: z.enum(["LUCRO_REAL", "LUCRO_PRESUMIDO", "SIMPLES"]),
      originUf: z.string().length(2),
      pisRatePercent: z.number().finite(),
      cofinsRatePercent: z.number().finite(),
      excludeIcmsFromPisCofinsBase: z.boolean(),
      considerIcmsStRecuperavel: z.boolean(),
      simplesAliquotaEfetivaPercent: z.number().finite().min(0).max(100).nullable(),
    })
    .partial()
    .optional(),
  icmsRate: z
    .object({
      uf: z.string().length(2),
      aliquotaBase: z.number().finite(),
      fcp: z.number().finite(),
    })
    .optional(),
  cbsIbs: z
    .object({
      year: z.number().int(),
      cbsRate: z.number().finite().nullable(),
      ibsEstadualRate: z.number().finite().nullable(),
      ibsMunicipalRate: z.number().finite().nullable(),
      notes: z.string().nullish(),
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

  try {
    if (body.company) {
      await updateTaxCompanyConfig(organizationId, body.company);
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
      loadTaxCompanyConfig(organizationId),
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
