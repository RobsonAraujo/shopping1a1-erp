import type { StatusTone } from "@/lib/ui/tone";
import {
  formatDreMonthList,
  singleForeignYear,
  type DreMonthListText,
  type DreMonthRef,
} from "@/lib/dre/dre-month-list";
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
  /**
   * Detalhe curto, já cortado pra caber no pill de uma linha (ex.: os meses de
   * uma pendência). **Opcional:** sinal sem detalhe renderiza como sempre.
   *
   * Existe porque contagem sem contexto deixa o usuário perdido: «5
   * conciliações de DRE pendentes» não diz onde agir.
   */
  detail?: string;
  /** O detalhe **completo**, sem corte — vai pro `title`/`aria-label` do pill,
   * onde não há limite de largura. Só existe quando há `detail`. */
  detailFull?: string;
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Os dois campos de detalhe, ou **nada** quando não há mês nenhum.
 *
 * Devolver `{}` e não `{ detail: "" }` é de propósito: string vazia faria o pill
 * renderizar um separador `·` solto, pendurado sem texto depois.
 */
function monthDetail(
  months: DreMonthListText,
): Pick<HomeAttentionSignal, "detail" | "detailFull"> {
  if (months.full === "") return {};
  return { detail: months.short, detailFull: months.full };
}

/**
 * Leva pro ano certo quando **todas** as pendências são de um ano só que não é o
 * corrente — senão o clique cai numa tabela onde não há pendência nenhuma, que é
 * o pior beco sem saída possível. Com anos misturados, o ano corrente é o melhor
 * destino, porque é onde está a maioria.
 *
 * Exportada porque o card de pendências aponta pro mesmo lugar que o pill: dois
 * cálculos separados poderiam divergir.
 */
export function dreHref(
  months: readonly DreMonthRef[],
  currentYear: number,
): string {
  const foreign = singleForeignYear(months, currentYear);
  return foreign === null ? "/dashboard/dre" : `/dashboard/dre?ano=${foreign}`;
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
    const months = formatDreMonthList(pendings.pendingDreImportMonths, {
      currentYear: pendings.year,
    });
    push({
      id: "dre-reconciliation-pending",
      count: pendings.pendingDreImports,
      label: plural(
        pendings.pendingDreImports,
        "conciliação de DRE pendente",
        "conciliações de DRE pendentes",
      ),
      tone: "warning",
      href: dreHref(pendings.pendingDreImportMonths, pendings.year),
      severity: 80,
      ...monthDetail(months),
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
    // A lista já estava em mão e era descartada com `.length` — nomear os meses
    // custa zero e é a mesma informação que falta na conciliação.
    const unsyncedMonths = pendings.dreMonths.filter(
      (month) => month.syncedAt === null,
    );
    const unsynced = unsyncedMonths.length;
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
      ...monthDetail(
        formatDreMonthList(unsyncedMonths, { currentYear: pendings.year }),
      ),
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
