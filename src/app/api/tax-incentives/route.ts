import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  IcmsIncentiveInputError,
  upsertIcmsIncentive,
} from "@/lib/tax-incentives/icms-incentive-data";
import { loadIcmsIncentiveScreen } from "@/lib/tax-incentives/icms-incentive-screen";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  try {
    return NextResponse.json(await loadIcmsIncentiveScreen(auth.ctx.organizationId));
  } catch (e) {
    logServerError("api/tax-incentives GET", e);
    return NextResponse.json(apiErrorPayload(e, "tax_incentives_load_failed"), {
      status: 502,
    });
  }
}

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .nullable()
  .optional();

const putBodySchema = z.object({
  ncm: z.string().trim().min(1),
  ratePercent: z.coerce.number().finite(),
  appliesTo: z.enum(["all", "contribuinte"]).default("all"),
  validFrom: ymd,
  validTo: ymd,
  note: z.string().max(500).nullable().optional(),
  /** "Não se aplica" dos outros produtos do NCM, como ficaram no diálogo. */
  products: z
    .array(z.object({ mlItemId: z.string().trim().min(1), excluded: z.boolean() }))
    .max(5000)
    .default([]),
});

export async function PUT(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsed = await parseJsonBody(request, putBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const rule = await upsertIcmsIncentive(
      organizationId,
      {
        ncm: body.ncm,
        ratePercent: body.ratePercent,
        appliesTo: body.appliesTo,
        validFrom: body.validFrom ?? null,
        validTo: body.validTo ?? null,
        note: body.note ?? null,
      },
      body.products,
    );
    return NextResponse.json({ rule, ...(await loadIcmsIncentiveScreen(organizationId)) });
  } catch (e) {
    if (e instanceof IcmsIncentiveInputError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logServerError("api/tax-incentives PUT", e);
    return NextResponse.json(apiErrorPayload(e, "tax_incentive_save_failed"), {
      status: 502,
    });
  }
}
