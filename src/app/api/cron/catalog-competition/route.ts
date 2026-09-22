import { NextRequest, NextResponse } from "next/server";
import {
  pollCatalogCompetitionForSeller,
  resolvePayingOrgSellersForCronBatch,
} from "@/lib/catalog-report/catalog-competition-poll";
import { recordCatalogPollRun } from "@/lib/catalog-report/catalog-competition-poll-stats";
import { resolveSellerAccessToken } from "@/lib/mercadolibre/persist-seller-tokens";
import { logServerError } from "@/lib/infra/server-public-error";
import { authorizeBearerSecret } from "@/lib/api/api-auth";
import { prisma } from "@/lib/db/db";

/**
 * Roda 1x/hora (cron-job.org — configuração externa, não muda por tenant).
 * O fan-out por organização acontece aqui dentro: processa um lote pequeno
 * de sellers pagantes por execução (os mais atrasados primeiro) e continua
 * de onde parou na próxima hora — sem fila/worker novo, sem precisar
 * reconfigurar nada no cron-job.org quando um cliente entra ou sai.
 *
 * É a ÚNICA fonte de atualização de competição de catálogo. Existiu um
 * webhook (`api/ml/notifications/catalog-competition`) cobrindo o caso
 * real-time, removido de propósito: um caminho só é mais fácil de raciocinar,
 * e o endpoint era público sem assinatura (a ML não oferece HMAC). O preço é
 * latência — cada seller espera `ceil(N / CRON_BATCH_SIZE)` horas. Ver
 * docs/architecture/saas-scale-triggers.md.
 */
const CRON_BATCH_SIZE = 10;

export async function POST(request: NextRequest) {
  if (!authorizeBearerSecret(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sellers = await resolvePayingOrgSellersForCronBatch(CRON_BATCH_SIZE);
  if (sellers.length === 0) {
    return NextResponse.json({ ok: true, processedSellers: 0, results: [] });
  }

  const results: Array<{
    mlUserId: number;
    organizationId: string;
    ok: boolean;
    checked?: number;
    changed?: number;
    error?: string;
  }> = [];

  for (const { mlUserId, organizationId } of sellers) {
    try {
      const token = await resolveSellerAccessToken(mlUserId);
      if (!token) {
        results.push({
          mlUserId,
          organizationId,
          ok: false,
          error: "no_valid_token",
        });
        continue;
      }

      const result = await pollCatalogCompetitionForSeller(
        token,
        mlUserId,
        organizationId,
        "cron",
      );

      await recordCatalogPollRun({
        organizationId,
        source: "cron",
        itemsChecked: result.checked,
        itemsChanged: result.changed,
        ok: result.errors.length === 0,
        errorSummary:
          result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null,
      });

      results.push({
        mlUserId,
        organizationId,
        ok: result.errors.length === 0,
        checked: result.checked,
        changed: result.changed,
      });
    } catch (e) {
      logServerError(`api/cron/catalog-competition seller=${mlUserId}`, e);
      results.push({
        mlUserId,
        organizationId,
        ok: false,
        error: e instanceof Error ? e.message : "cron_failed",
      });
    } finally {
      // Atualiza mesmo em erro — um seller com falha não deve travar a
      // rotação e ficar sempre em primeiro no próximo lote.
      await prisma.organizationMlSeller
        .update({
          where: { organizationId_mlUserId: { organizationId, mlUserId } },
          data: { lastCatalogCronPolledAt: new Date() },
        })
        .catch((e) =>
          logServerError(
            `api/cron/catalog-competition update-cursor seller=${mlUserId}`,
            e,
          ),
        );
    }
  }

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    processedSellers: results.length,
    results,
  });
}
