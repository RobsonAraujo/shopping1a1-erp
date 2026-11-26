import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { deleteIcmsIncentive } from "@/lib/tax-incentives/icms-incentive-data";
import { loadIcmsIncentiveScreen } from "@/lib/tax-incentives/icms-incentive-screen";
import { normalizeNcm } from "@/lib/tax-incentives/ncm";

type RouteContext = { params: Promise<{ ncm: string }> };

/** Remove o incentivo do NCM (e o "não se aplica" dos produtos dele). */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;
  const { ncm: rawNcm } = await context.params;
  const ncm = normalizeNcm(decodeURIComponent(rawNcm));
  if (!ncm) {
    return NextResponse.json({ error: "NCM precisa ter 8 dígitos" }, { status: 400 });
  }

  try {
    const deleted = await deleteIcmsIncentive(organizationId, ncm);
    if (!deleted) {
      return NextResponse.json({ error: "Incentivo não encontrado" }, { status: 404 });
    }
    return NextResponse.json(await loadIcmsIncentiveScreen(organizationId));
  } catch (e) {
    logServerError("api/tax-incentives/[ncm] DELETE", e);
    return NextResponse.json(apiErrorPayload(e, "tax_incentive_delete_failed"), {
      status: 502,
    });
  }
}
