import { NextRequest, NextResponse } from "next/server";
import { loadFinancialEvaluationRows } from "@/lib/lucratividade/financial-evaluation-data";
import type { MarginBasis } from "@/lib/pricing/financial-margin";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { token, userId, organizationId } = auth.ctx;

  const targetMarginParam =
    request.nextUrl.searchParams.get("targetMarginPercent");
  const targetMarginPercent = Number(targetMarginParam);
  if (!Number.isFinite(targetMarginPercent)) {
    return NextResponse.json(
      { error: "targetMarginPercent is required" },
      { status: 400 },
    );
  }

  const marginBasisParam = request.nextUrl.searchParams.get("marginBasis");
  const marginBasis: MarginBasis =
    marginBasisParam === "afterAds" ? "afterAds" : "contribution";

  const itemIdsParam = request.nextUrl.searchParams.get("itemIds");
  const itemIds = itemIdsParam
    ? itemIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;

  try {
    const rows = await loadFinancialEvaluationRows(token, userId, organizationId, {
      itemIds,
      targetMarginPercent,
      marginBasis,
      signal: request.signal,
    });
    const returnedIds = new Set(rows.map((row) => row.mlItemId));

    return NextResponse.json({
      targetMarginPercent,
      marginBasis,
      patches: rows.map((row) => ({
        mlItemId: row.mlItemId,
        // Preço de hoje do anúncio — no modo período a linha da tabela traz o
        // preço médio vendido; a comparação "quanto falta subir" usa este.
        currentSalePrice: row.salePrice,
        minSalePriceForTarget: row.minSalePriceForTarget ?? null,
        minSalePriceTargetPercent: row.minSalePriceTargetPercent ?? null,
        minSalePriceMarginBasis: row.minSalePriceMarginBasis ?? null,
        minSalePriceRefined: row.minSalePriceRefined ?? false,
      })),
      // Anúncios pedidos que não estão mais ativos/pausados (ex.: encerrados
      // que ainda aparecem num período de vendas) — sem preço p/ meta.
      notOperationalIds: (itemIds ?? []).filter((id) => !returnedIds.has(id)),
    });
  } catch (e) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    logServerError("api/financial-evaluation/min-prices GET", e);
    return NextResponse.json(apiErrorPayload(e, "min_prices_failed"), {
      status: 502,
    });
  }
}
