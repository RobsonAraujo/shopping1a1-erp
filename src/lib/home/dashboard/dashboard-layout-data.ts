import { prisma } from "@/lib/db/db";
import {
  dashboardPreferencesFromViews,
  dashboardViewsPayload,
  normalizeDashboardPreferences,
  type DashboardView,
} from "@/lib/home/dashboard/dashboard-preferences";

/**
 * O lado servidor do layout da Home.
 *
 * As versões são **compartilhadas pela organização** (decisão de produto: dar
 * nome de pessoa a uma versão só faz sentido se as outras pessoas a veem). Qual
 * versão abre é por navegador e não passa por aqui — ver `DashboardLayout` no
 * schema.
 *
 * `revision` é o que impede clobber silencioso: duas pessoas arrastando ao mesmo
 * tempo, a segunda escrita chega com revisão velha e é recusada em vez de apagar
 * o trabalho da primeira.
 */

export type DashboardLayoutRecord = {
  views: DashboardView[];
  /** 0 = ainda não existe linha para a organização. */
  revision: number;
};

export async function loadDashboardLayout(
  organizationId: string,
): Promise<DashboardLayoutRecord> {
  const row = await prisma.dashboardLayout.findUnique({
    where: { organizationId },
    select: { views: true, revision: true },
  });
  if (!row) return { views: [], revision: 0 };

  // Normaliza na leitura: o blob pode ter sido escrito por uma versão anterior
  // do registry.
  const prefs = dashboardPreferencesFromViews(row.views, null);
  return { views: dashboardViewsPayload(prefs), revision: row.revision };
}

export type SaveDashboardLayoutResult =
  | { ok: true; record: DashboardLayoutRecord }
  | { ok: false; reason: "stale"; record: DashboardLayoutRecord };

/**
 * Grava o conjunto inteiro, se `expectedRevision` casar com o que está no banco.
 *
 * `expectedRevision: 0` significa "estou criando" — e o `create` falhando por
 * chave duplicada é tratado como conflito, que é o caso de duas abas importando
 * o localStorage ao mesmo tempo.
 */
export async function saveDashboardLayout(
  organizationId: string,
  views: unknown,
  expectedRevision: number,
): Promise<SaveDashboardLayoutResult> {
  // Normaliza na escrita também: nada do client entra no banco sem passar pelo
  // mesmo filtro que a leitura usa.
  const normalized = normalizeDashboardPreferences({
    version: 1,
    views,
  });
  const payload = dashboardViewsPayload(normalized);

  if (expectedRevision === 0) {
    try {
      const created = await prisma.dashboardLayout.create({
        data: { organizationId, views: payload, revision: 1 },
        select: { views: true, revision: true },
      });
      return {
        ok: true,
        record: { views: payload, revision: created.revision },
      };
    } catch {
      return { ok: false, reason: "stale", record: await loadDashboardLayout(organizationId) };
    }
  }

  // `updateMany` com a revisão no `where`: compare-and-set numa query, sem
  // transação e sem janela de corrida entre ler e escrever.
  const updated = await prisma.dashboardLayout.updateMany({
    where: { organizationId, revision: expectedRevision },
    data: { views: payload, revision: expectedRevision + 1 },
  });

  if (updated.count === 0) {
    return {
      ok: false,
      reason: "stale",
      record: await loadDashboardLayout(organizationId),
    };
  }

  return {
    ok: true,
    record: { views: payload, revision: expectedRevision + 1 },
  };
}
