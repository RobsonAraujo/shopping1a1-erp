import {
  AlertTriangle,
  Boxes,
  CheckSquare,
  Kanban,
  LayoutGrid,
  LineChart,
  ListChecks,
  NotebookPen,
  Percent,
  ShoppingCart,
  Tags,
  Timer,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CategoryTone } from "@/lib/ui/tone";
import type { HomeWidgetDataKey } from "@/lib/home/dashboard/widget-data-keys";

/**
 * Registry da Home configurável. **Só metadado**: nada de componente, nada
 * de `prisma`, nada de `server-only`. É importado por RSC, route handler,
 * componente client e teste node — se ganhar um import de servidor, a grade
 * quebra no bundle do client.
 *
 * `icon` é uma função (LucideIcon), então uma `HomeWidgetDefinition` **não
 * pode** ser passada como prop de Server para Client Component ("Functions
 * cannot be passed directly to Client Components"). Componentes client
 * importam `HOME_WIDGET_DEFINITIONS` daqui, direto.
 *
 * Adicionar um widget = uma entrada aqui + um componente no mapa de
 * `HomeWidgetRenderer`. Nada mais.
 */

/**
 * Quantas colunas o layout tem. **Fixo, não varia por viewport** — e a razão é
 * perda de dado, não estética: `column` é persistido, então se a contagem
 * mudasse por breakpoint o normalizador teria que clampar para a contagem da
 * tela atual, e o primeiro arrasto no celular gravaria o layout colapsado de
 * volta, destruindo o layout do desktop.
 *
 * Crescer (2 → 3) é seguro: nenhum `column` já gravado fica inválido.
 */
export const HOME_DASHBOARD_COLUMN_COUNT = 2;

/** Literal porque o Tailwind v4 varre o texto do fonte e este projeto não tem
 * arquivo de config pra safelist. Tem que casar com
 * `HOME_DASHBOARD_COLUMN_COUNT` — há teste. */
export const HOME_DASHBOARD_GRID_CLASS = "grid-cols-1 md:grid-cols-2";

/** Faixa de largura cheia acima das colunas, ou card de uma coluna. */
export type HomeWidgetLayout = "banner" | "card";

export type HomeWidgetCategory =
  | "atencao"
  | "operacao"
  | "financeiro"
  | "analises"
  | "estoque"
  | "pessoal";

/** P0 pinta no primeiro load (dado de core/SSR). P1 é importante mas pode
 * chegar depois. P2 é secundário — carrega sob demanda/diferido. */
export type HomeWidgetPriority = "p0" | "p1" | "p2";

/**
 * De onde vem o dado do widget. Determina também COMO a invisibilidade é
 * expressa (ver `HomeWidgetSlot`):
 *
 * - `core`/`local`/`server-island`: o dado já está presente de graça, então
 *   o widget escondido é renderizado e oculto por CSS — não economiza nada
 *   desmontar, e manter montado deixa o diff de hidratação só de atributo.
 * - `batch`/`isolated`: buscado no client depois do mount. Widget escondido
 *   **não é renderizado** — é aí que está a economia real.
 */
export type HomeWidgetSource =
  | { kind: "core" }
  | { kind: "local" }
  | { kind: "server-island" }
  | { kind: "batch"; dataKey: HomeWidgetDataKey }
  | { kind: "isolated"; endpoint: string };

export type HomeWidgetDefinition = {
  id: string;
  title: string;
  /** Aparece no sheet de personalização — explica o que o widget mostra. */
  description: string;
  category: HomeWidgetCategory;
  icon: LucideIcon;
  tone: CategoryTone;
  defaultVisible: boolean;
  /** Único e esparso (10, 20, 30…) pra caber inserção de widget novo entre
   * dois existentes sem renumerar o registry inteiro. */
  defaultOrder: number;
  layout: HomeWidgetLayout;
  /** Coluna inicial do card (0..DASHBOARD_COLUMN_COUNT-1). Irrelevante para
   * `banner`. */
  defaultColumn: number;
  source: HomeWidgetSource;
  priority: HomeWidgetPriority;
  /** Página de detalhe. Precisa ser rota real (o teste do registry valida
   * contra `getAllDashboardNavItems()`). */
  href?: string;
  /** Não pode ser escondido nem sair do topo — a zona de atenção. */
  pinned?: boolean;
};


export const HOME_WIDGET_DEFINITIONS: readonly HomeWidgetDefinition[] = [
  {
    id: "atencao",
    title: "Precisa da sua atenção",
    description:
      "Tudo que está pedindo ação agora, em ordem de urgência. Vira uma linha só quando não há nada pendente.",
    category: "atencao",
    icon: AlertTriangle,
    tone: "rose",
    defaultVisible: true,
    defaultOrder: 10,
    layout: "banner",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p0",
    pinned: true,
  },
  {
    id: "onboarding",
    title: "Primeiros passos",
    description:
      "Checklist de configuração inicial. Desaparece sozinho quando os três passos estão concluídos.",
    category: "atencao",
    icon: ListChecks,
    tone: "primary",
    defaultVisible: true,
    defaultOrder: 20,
    layout: "banner",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p0",
    pinned: true,
  },
  {
    id: "kpi-vendas",
    title: "Vendas",
    description:
      "Vendas concluídas e reputação da sua conta no Mercado Livre.",
    category: "operacao",
    icon: TrendingUp,
    tone: "emerald",
    defaultVisible: true,
    defaultOrder: 30,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "server-island" },
    priority: "p0",
  },
  {
    id: "kpi-compras",
    title: "Compras",
    description:
      "Compras em andamento no kanban de reposição e quantas já foram compradas no ciclo.",
    category: "operacao",
    icon: ShoppingCart,
    tone: "primary",
    defaultVisible: true,
    defaultOrder: 40,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p0",
    href: "/dashboard/compras?tab=kanban",
  },
  {
    id: "kpi-full",
    title: "Full",
    description:
      "Envios ao Full em andamento e quantos já foram coletados no ciclo.",
    category: "operacao",
    icon: Kanban,
    tone: "violet",
    defaultVisible: true,
    defaultOrder: 50,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p0",
    href: "/dashboard/operacoes-full",
  },
  {
    id: "produtos-saude",
    title: "Saúde do catálogo",
    description:
      "Quantos produtos estão cadastrados, quantos anúncios estão ativos e quantos custos precisam de revisão.",
    category: "operacao",
    icon: Boxes,
    tone: "primary",
    defaultVisible: true,
    defaultOrder: 70,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p1",
    href: "/dashboard/produtos",
  },
  {
    id: "tarefas-hoje",
    title: "Onde você vai trabalhar hoje?",
    description:
      "Sua lista de tarefas do dia, guardada apenas neste navegador.",
    category: "pessoal",
    icon: CheckSquare,
    tone: "primary",
    defaultVisible: true,
    defaultOrder: 120,
    layout: "card",
    defaultColumn: 1,
    source: { kind: "local" },
    priority: "p1",
  },
  {
    id: "notas",
    title: "Notas rápidas",
    description: "Um rascunho sempre à mão, guardado apenas neste navegador.",
    category: "pessoal",
    icon: NotebookPen,
    tone: "amber",
    defaultVisible: true,
    defaultOrder: 130,
    layout: "card",
    defaultColumn: 1,
    source: { kind: "local" },
    priority: "p1",
  },
  {
    id: "foco",
    title: "Foco",
    description: "Cronômetro de sessão de trabalho concentrado.",
    category: "pessoal",
    icon: Timer,
    tone: "violet",
    defaultVisible: true,
    defaultOrder: 140,
    layout: "card",
    defaultColumn: 1,
    source: { kind: "local" },
    priority: "p1",
  },
  {
    id: "dre-resultado",
    title: "Resultado do mês",
    description:
      "Faturamento, margem de contribuição e lucro operacional do último mês sincronizado, com a curva do ano.",
    category: "financeiro",
    icon: LineChart,
    tone: "emerald",
    defaultVisible: true,
    defaultOrder: 60,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "batch", dataKey: "finance" },
    priority: "p1",
    href: "/dashboard/dre",
  },
  {
    id: "pendencias",
    title: "Pendências do sistema",
    description:
      "Fechamentos de estoque que falharam, conciliações de DRE pendentes, meses sem sincronizar e saúde do monitoramento de catálogo.",
    category: "atencao",
    icon: Wrench,
    tone: "amber",
    defaultVisible: true,
    defaultOrder: 80,
    layout: "card",
    defaultColumn: 0,
    source: { kind: "core" },
    priority: "p1",
    href: "/dashboard/dre",
  },
  {
    id: "catalogo-perdendo",
    title: "Catálogo perdendo",
    description:
      "Anúncios de catálogo em que você está perdendo a competição, com a diferença até o preço para ganhar.",
    category: "atencao",
    icon: Tags,
    tone: "rose",
    defaultVisible: true,
    defaultOrder: 90,
    layout: "card",
    defaultColumn: 1,
    source: { kind: "core" },
    priority: "p0",
    href: "/dashboard/catalog-report",
  },
  // ── Os dois únicos widgets que batem no Mercado Livre a cada carregamento ──
  //
  // Todo o resto da Home é banco (ou localStorage): o padrão custa ~25 KB de
  // egress por load. Estes dois custam chamadas ao ML, que é o recurso caro —
  // tempo de função e limite de taxa, não bytes.
  //
  // Medido numa org com 40 anúncios ativos (11 próprios) e 2 PMAs cadastrados:
  //   pma:       1 chamada por produto com PMA        → ~3 hoje
  //   promoções: 1-2 por anúncio próprio ativo        → ~20 hoje
  //
  // Os dois escalam com o catálogo do seller: num seller de 200 anúncios
  // próprios, promoções passa de ~300 chamadas POR ABERTURA da Home (é por isso
  // que a rota tem `maxDuration = 300`).
  //
  // Isso foi medido e aceito de propósito — é o mesmo custo que a Home já tinha
  // antes da plataforma de widgets, e a feature é considerada importante. A
  // diferença é que agora dá pra desligar. Se apertar, o caminho já está
  // mapeado: cron 2x/dia gravando numa tabela (o padrão que `catalogo-perdendo`
  // já usa, e que custa 650 B e zero chamada ao ML), o que corta ~80%.
  // Cron de hora em hora seria PIOR que ao vivo — a conta está no histórico
  // desta decisão.
  {
    id: "pma",
    title: "Abaixo do PMA",
    description:
      "Anúncios com preço abaixo do mínimo anunciável que você cadastrou.",
    category: "atencao",
    icon: AlertTriangle,
    tone: "rose",
    defaultVisible: true,
    defaultOrder: 100,
    layout: "card",
    defaultColumn: 1,
    source: { kind: "isolated", endpoint: "/api/dashboard/widgets/pma" },
    priority: "p1",
  },
  {
    id: "promocoes",
    title: "Promoções terminando",
    description:
      "Promoções do Mercado Livre que vencem nos próximos dias, para você decidir se renova.",
    category: "atencao",
    icon: Percent,
    tone: "amber",
    defaultVisible: true,
    defaultOrder: 110,
    layout: "card",
    defaultColumn: 1,
    source: {
      kind: "isolated",
      endpoint: "/api/dashboard/summary/promotions",
    },
    priority: "p2",
  },
  {
    id: "atalhos",
    title: "Atalhos",
    description:
      "Acesso rápido às telas que você mais usa, sem passar pelo menu.",
    category: "operacao",
    icon: LayoutGrid,
    tone: "primary",
    defaultVisible: false,
    defaultOrder: 150,
    layout: "card",
    defaultColumn: 1,
    source: { kind: "local" },
    priority: "p2",
  },
];

export const HOME_WIDGET_CATEGORY_LABEL: Record<HomeWidgetCategory, string> = {
  atencao: "Atenção",
  operacao: "Operação",
  financeiro: "Financeiro",
  analises: "Análises",
  estoque: "Estoque",
  pessoal: "Pessoal",
};

export const HOME_WIDGET_CATEGORY_ORDER: readonly HomeWidgetCategory[] = [
  "atencao",
  "operacao",
  "financeiro",
  "analises",
  "estoque",
  "pessoal",
];

const DEFINITION_BY_ID = new Map(
  HOME_WIDGET_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getHomeWidgetDefinition(
  id: string,
): HomeWidgetDefinition | null {
  return DEFINITION_BY_ID.get(id) ?? null;
}

/** Chaves de batch que um conjunto de widgets visíveis precisa — ordenadas e
 * deduplicadas, pra servir de dependência estável de effect. */
export function homeWidgetDataKeysFor(
  ids: readonly string[],
): HomeWidgetDataKey[] {
  const keys = new Set<HomeWidgetDataKey>();
  for (const id of ids) {
    const source = DEFINITION_BY_ID.get(id)?.source;
    if (source?.kind === "batch") keys.add(source.dataKey);
  }
  // ordem estável = ordem do registry
  return HOME_WIDGET_DEFINITIONS.flatMap((definition) =>
    definition.source.kind === "batch" && keys.has(definition.source.dataKey)
      ? [definition.source.dataKey]
      : [],
  ).filter((key, index, all) => all.indexOf(key) === index);
}
