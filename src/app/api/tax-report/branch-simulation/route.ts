import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { parseJsonBody } from "@/lib/api-validation";
import { collectDetalhes } from "@/lib/tax-report/repair-snapshot-apuracao";
import {
  listTaxReportSnapshotPeriods,
  loadTaxReportSnapshot,
} from "@/lib/tax-report/service/generate-monthly-report";
import {
  buildBranchSimulationResult,
  isSupportedBranchSimulationUf,
  SOUTH_SOUTHEAST_ORIGIN_UFS,
} from "@/lib/tax-report/service/branch-simulation";
import {
  loadIcmsRatesMap,
  loadTaxCompanyConfig,
} from "@/lib/tax-report/tax-config-data";
import type { DetalhamentoTributario } from "@/lib/tax-report/types";

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const sellerId = auth.ctx.userId;

  try {
    const periods = await listTaxReportSnapshotPeriods(sellerId);
    return NextResponse.json({ periods, supportedUfs: SOUTH_SOUTHEAST_ORIGIN_UFS });
  } catch (e) {
    logServerError("api/tax-report/branch-simulation GET", e);
    return NextResponse.json(
      apiErrorPayload(e, "branch_simulation_periods_failed"),
      { status: 502 },
    );
  }
}

const postBodySchema = z.object({
  periods: z
    .array(z.object({ year: z.number().int(), month: z.number().int() }))
    .default([]),
  targetUf: z.string().default(""),
  creditoPresumidoPercent: z.number().finite().default(0),
  supplierUfByFornecedor: z.record(z.string(), z.string()).optional(),
  compareUfs: z
    .array(
      z.object({
        uf: z.string(),
        creditoPresumidoPercent: z.number().finite(),
      }),
    )
    .default([]),
});

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { userId: sellerId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, postBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const periods = body.periods;
  const targetUf = (body.targetUf ?? "").toUpperCase();
  const creditoPresumidoPercent = Number(body.creditoPresumidoPercent ?? 0);

  if (periods.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um período" }, {
      status: 400,
    });
  }
  if (!isSupportedBranchSimulationUf(targetUf)) {
    return NextResponse.json(
      {
        error: `UF de destino não suportada na simulação. UFs válidas: ${SOUTH_SOUTHEAST_ORIGIN_UFS.join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (!Number.isFinite(creditoPresumidoPercent) || creditoPresumidoPercent < 0) {
    return NextResponse.json({ error: "Crédito presumido inválido" }, {
      status: 400,
    });
  }

  try {
    const [config, icmsRates, payloads] = await Promise.all([
      loadTaxCompanyConfig(organizationId),
      loadIcmsRatesMap(),
      Promise.all(
        periods.map((p) => loadTaxReportSnapshot(sellerId, p.year, p.month)),
      ),
    ]);

    const detalhes: DetalhamentoTributario[] = payloads
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .flatMap((payload) => collectDetalhes(payload));

    const supplierUfByFornecedor = body.supplierUfByFornecedor
      ? new Map(
          Object.entries(body.supplierUfByFornecedor).filter(
            ([, uf]) => typeof uf === "string" && uf.trim().length > 0,
          ),
        )
      : undefined;

    const result = buildBranchSimulationResult(detalhes, {
      config: { ...config, originUf: targetUf },
      icmsRates,
      creditoPresumidoPercent,
      supplierUfByFornecedor,
    });

    const comparison = (body.compareUfs ?? [])
      .filter((c) => isSupportedBranchSimulationUf((c.uf ?? "").toUpperCase()))
      .map((c) => {
        const uf = c.uf.toUpperCase();
        const percent = Number(c.creditoPresumidoPercent ?? 0);
        const totais = buildBranchSimulationResult(detalhes, {
          config: { ...config, originUf: uf },
          icmsRates,
          creditoPresumidoPercent: Number.isFinite(percent) ? percent : 0,
          supplierUfByFornecedor,
        }).totais;
        return { uf, creditoPresumidoPercent: percent, totais };
      });

    return NextResponse.json({ result, comparison });
  } catch (e) {
    logServerError("api/tax-report/branch-simulation POST", e);
    return NextResponse.json(apiErrorPayload(e, "branch_simulation_failed"), {
      status: 502,
    });
  }
}
