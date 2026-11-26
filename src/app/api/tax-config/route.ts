import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listCbsIbsVigencia,
  listIcmsInternalRates,
  loadTaxCompanyConfig,
  updateTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { normalizeUf } from "@/lib/tax-report/brazilian-ufs";

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
      difalCollection: z.enum(["all", "none", "some"]),
      difalCollectedUfs: z.array(z.string().trim().length(2)).max(27),
    })
    .partial()
    .optional(),
  /**
   * ICMS interno por UF e CBS/IBS são tabelas globais (todas as organizações);
   * mantidas só por migration. Aceitos no schema apenas para responder 403.
   */
  icmsRate: z.unknown().optional(),
  cbsIbs: z.unknown().optional(),
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

  if (body.icmsRate !== undefined || body.cbsIbs !== undefined) {
    return NextResponse.json(
      {
        error:
          "As alíquotas de ICMS por UF e de CBS/IBS valem para todas as empresas e são mantidas pela Maipo.",
        code: "global_tax_table_read_only",
      },
      { status: 403 },
    );
  }

  try {
    if (body.company) {
      const { difalCollectedUfs, ...company } = body.company;
      await updateTaxCompanyConfig(organizationId, {
        ...company,
        // Só UFs válidas, sem repetição; a UF da empresa não tem DIFAL.
        ...(difalCollectedUfs !== undefined
          ? {
              difalCollectedUfs: [
                ...new Set(
                  difalCollectedUfs
                    .map((uf) => normalizeUf(uf))
                    .filter((uf): uf is string => uf != null),
                ),
              ].sort(),
            }
          : {}),
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
