import { NextRequest, NextResponse } from "next/server";
import { loadTaxReportForPeriod } from "@/lib/tax-report/service/period-report";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { stripTransacoesForResponse } from "@/lib/tax-report/strip-transacoes-for-response";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

function parseFromTo(searchParams: URLSearchParams): {
  from: string;
  to: string;
} | null {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !YMD_RE.test(from) || !YMD_RE.test(to)) return null;
  if (from > to) return null;

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const diffDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (diffDays > MAX_RANGE_DAYS) return null;

  return { from, to };
}

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { userId, organizationId } = auth.ctx;

  const parsed = parseFromTo(request.nextUrl.searchParams);
  if (!parsed) {
    return NextResponse.json(
      { error: `from e to são obrigatórios (YYYY-MM-DD, from <= to, máx. ${MAX_RANGE_DAYS} dias)` },
      { status: 400 },
    );
  }

  try {
    const { payload, missingMonths } = await loadTaxReportForPeriod(
      organizationId,
      userId,
      parsed.from,
      parsed.to,
    );
    // Por padrão devolve o payload completo (ex.: card DIFAL de Insights
    // precisa de `porSku[].transacoes` de todos os SKUs). Consumidores que só
    // usam agregados ou 1 SKU pedem `summary`/`sku` para evitar trafegar o
    // detalhamento por venda inteiro.
    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get("sku") ?? undefined;
    const summary = searchParams.get("summary") === "1";
    const responsePayload =
      sku || summary ? stripTransacoesForResponse(payload, sku) : payload;
    return NextResponse.json({ ...responsePayload, missingMonths });
  } catch (e) {
    logServerError("api/reports/period-tax GET", e);
    return NextResponse.json(apiErrorPayload(e, "period_tax_load_failed"), {
      status: 502,
    });
  }
}
