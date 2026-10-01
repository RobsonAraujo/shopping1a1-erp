import type { StatusTone } from "@/lib/ui/tone";
import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";

/**
 * A zona "precisa da sua atenção" — derivada **só do snapshot de core**,
 * função pura.
 *
 * Duas exclusões deliberadas, e as duas são o que faz a zona ter valor:
 *
 * - **PMA e promoções**, mesmo sendo alertas: chegam depois do mount e depois
 *   de uma ida ao Mercado Livre, então fariam a zona piscar entre "tudo em
 *   ordem" e populada a cada load. Seguem como cards próprios, com skeleton.
 * - **Compras/envios em andamento**: é operação normal, não pendência. Qualquer
 *   vendedor ativo tem cards no kanban, então incluir isso deixaria a zona
 *   permanentemente cheia — ela nunca colapsaria e viraria ruído, o oposto de
 *   "me mostre o que precisa de ação". Esses números já têm card de KPI próprio.
 *
 * Aqui só entra o que está errado e o que já está na primeira pintura — o que
 * também torna esta função testável sem mock nenhum.
 */

export type HomeAttentionSignal = {
  id: string;
  label: string;
  count: number;
  tone: StatusTone;
  href: string;
  /** Maior = mais urgente. Ordena a zona. */
  severity: number;
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function buildHomeAttentionSignals(
  core: HomeCoreSnapshot,
): HomeAttentionSignal[] {
  const signals: HomeAttentionSignal[] = [];
  const push = (signal: HomeAttentionSignal) => {
    if (signal.count > 0) signals.push(signal);
  };

  const pendings = core.pendings;
  if (pendings) {
    push({
      id: "inventory-runs-failed",
      count: pendings.failedInventoryRuns,
      label: plural(
        pendings.failedInventoryRuns,
        "fechamento de estoque falhou",
        "fechamentos de estoque falharam",
      ),
      tone: "danger",
      href: "/dashboard/inventory/historico",
      severity: 100,
    });
  }

  push({
    id: "catalog-losing",
    count: core.catalogLosing.total,
    label: plural(
      core.catalogLosing.total,
      "anúncio perdendo o catálogo",
      "anúncios perdendo o catálogo",
    ),
    tone: "danger",
    href: "/dashboard/catalog-report",
    severity: 90,
  });

  if (pendings) {
    push({
      id: "dre-reconciliation-pending",
      count: pendings.pendingDreImports,
      label: plural(
        pendings.pendingDreImports,
        "conciliação de DRE pendente",
        "conciliações de DRE pendentes",
      ),
      tone: "warning",
      href: "/dashboard/dre",
      severity: 80,
    });
  }

  if (core.catalog) {
    push({
      id: "products-need-cost-review",
      count: core.catalog.needsCostReviewCount,
      label: plural(
        core.catalog.needsCostReviewCount,
        "produto com custo a revisar",
        "produtos com custo a revisar",
      ),
      tone: "warning",
      href: "/dashboard/produtos",
      severity: 70,
    });
  }

  // Monitoramento parado é um sinal binário: não rodou hoje = 1 aviso.
  if (core.catalogPoll && core.catalogPoll.todayCount === 0) {
    push({
      id: "catalog-poll-idle",
      count: 1,
      label: "monitoramento de catálogo sem rodar hoje",
      tone: "warning",
      href: "/dashboard/catalog-report",
      severity: 50,
    });
  }

  if (pendings) {
    const unsynced = pendings.dreMonths.filter(
      (month) => month.syncedAt === null,
    ).length;
    push({
      id: "dre-months-unsynced",
      count: unsynced,
      label: plural(
        unsynced,
        "mês de DRE sem sincronizar",
        "meses de DRE sem sincronizar",
      ),
      tone: "neutral",
      href: "/dashboard/dre",
      severity: 40,
    });
  }

  return signals.sort((a, b) => {
    if (a.severity !== b.severity) return b.severity - a.severity;
    return b.count - a.count;
  });
}

export function hasAnyAttention(
  signals: readonly HomeAttentionSignal[],
): boolean {
  return signals.length > 0;
}

/** Monitoramentos que a zona reporta como "ok" quando não há nada pendente —
 * a seção vazia nunca some da Home (o usuário precisa saber que o
 * monitoramento existe e está rodando), mas colapsa numa linha só. */
export const HOME_ATTENTION_MONITORS: readonly string[] = [
  "Catálogo",
  "Custos",
  "DRE",
  "Estoque",
];
