import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import {
  loadDashboardLayout,
  saveDashboardLayout,
} from "@/lib/home/dashboard/dashboard-layout-data";
import { MAX_DASHBOARD_VIEWS } from "@/lib/home/dashboard/dashboard-preferences";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";

/**
 * As versões da Home, compartilhadas pela organização.
 *
 * O `GET` existe pra recarregar depois de um conflito; o primeiro carregamento
 * não passa por aqui — a página já lê o layout no servidor e entrega pronto ao
 * provider, então quem personalizou vê o próprio layout no primeiro paint.
 *
 * O `PUT` é **compare-and-set** por `revision`: escrita com revisão velha volta
 * 409 com o estado atual, e o client adota o do servidor em vez de sobrescrever
 * o que outra pessoa acabou de arrastar.
 */
export const dynamic = "force-dynamic";

/**
 * O corpo é validado de leve de propósito: a forma de verdade é imposta por
 * `normalizeDashboardPreferences` dentro de `saveDashboardLayout`, que é o mesmo
 * filtro da leitura e já tem teste. Duplicar o shape em zod daria duas
 * definições pra manter em sincronia. O que importa aqui é **tamanho** — o resto
 * o normalizador descarta.
 */
const bodySchema = z.object({
  views: z.array(z.unknown()).min(1).max(MAX_DASHBOARD_VIEWS),
  revision: z.number().int().min(0).max(1_000_000),
});

export async function GET() {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const record = await loadDashboardLayout(auth.ctx.organizationId);
    return NextResponse.json(record, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    logServerError("api/dashboard/layout GET", e);
    return NextResponse.json(apiErrorPayload(e, "dashboard_layout_failed"), {
      status: 500,
    });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const body = await parseJsonBody(request, bodySchema);
  if (!body.ok) return body.response;

  try {
    const result = await saveDashboardLayout(
      auth.ctx.organizationId,
      body.data.views,
      body.data.revision,
    );

    if (!result.ok) {
      // 409 carrega o estado atual: o client não precisa de um GET a mais pra
      // se recuperar.
      return NextResponse.json(
        { error: "stale_revision", ...result.record },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json(result.record, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    logServerError("api/dashboard/layout PUT", e);
    return NextResponse.json(apiErrorPayload(e, "dashboard_layout_failed"), {
      status: 500,
    });
  }
}
