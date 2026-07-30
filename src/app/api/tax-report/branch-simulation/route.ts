import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getValidAccessToken, readSession } from "@/lib/mercadolibre/session";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
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

async function requireSellerId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const { userId } = readSession(cookieStore);
  if (!token || userId === undefined) return null;
  return userId;
}

export async function GET() {
  const sellerId = await requireSellerId();
  if (sellerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

type PostBody = {
  periods?: { year: number; month: number }[];
  targetUf?: string;
  creditoPresumidoPercent?: number;
  supplierUfByFornecedor?: Record<string, string>;
  compareUfs?: { uf: string; creditoPresumidoPercent: number }[];
};

export async function POST(request: NextRequest) {
  const sellerId = await requireSellerId();
  if (sellerId === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const periods = body.periods ?? [];
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
    return NextResponse.json({ error: "Carga efetiva ICMS inválida" }, {
      status: 400,
    });
  }

  try {
    const [config, icmsRates, payloads] = await Promise.all([
      loadTaxCompanyConfig(),
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
