import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Building2,
  Calculator,
  ChartNoAxesColumn,
  Factory,
  Kanban,
  LayoutGrid,
  Lightbulb,
  LineChart,
  ListChecks,
  Scale,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";
export type DashboardNavBadge = {
  label: string;
  variant: "secondary" | "warning";
};

export type DashboardNavItem = {
  href: string;
  label: string;
  /**
   * Rótulo curto na barra do topo abaixo de 1280px (`xl`). Nome longo no topo
   * empurra "Configurações" para fora da barra em notebook; o nome inteiro
   * continua no tooltip e para leitor de tela.
   */
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
  badge?: DashboardNavBadge;
  /** Tooltip no link (ex.: aviso do DRE). */
  title?: string;
  /**
   * Rotas reais adicionais que também contam como "ativo" pra este item —
   * usado quando `href` é um redirecionador server-side (ex.: `/dashboard/tributario`,
   * que manda pra Lucro Real ou Simples Nacional conforme o regime da
   * empresa) e a URL final no navegador não é mais `href`.
   */
  matchHrefs?: string[];
  /**
   * Subtítulo dentro do grupo (ex.: "Full" em Operação). Itens seguidos com a
   * mesma seção ficam juntos sob o subtítulo, no dropdown e no menu mobile.
   */
  section?: string;
  /**
   * Nome fora do menu (atalhos da Início), onde a seção não aparece:
   * "Agendamentos" sozinho não diz que é do Full.
   */
  contextLabel?: string;
};

export type DashboardNavGroup = {
  id: string;
  /** Rótulo do dropdown desktop / cabeçalho mobile. Vazio para topo fixo. */
  label: string;
  /**
   * `top`: links soltos no começo da barra. `dropdown`: menus da barra.
   * `account`: no menu da conta (nome da loja, à direita), junto do Sair.
   */
  kind: "top" | "dropdown" | "account";
  items: DashboardNavItem[];
};

export type DashboardNavSection = {
  /** `null` = itens sem seção (o grupo inteiro, na maioria). */
  label: string | null;
  items: DashboardNavItem[];
};

export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    id: "top",
    label: "",
    kind: "top",
    items: [
      {
        href: "/dashboard",
        label: "Início",
        description: "Prioridades, atalhos e alertas do dia",
        icon: LayoutGrid,
      },
      {
        href: "/dashboard/acoes",
        label: "Ações do dia",
        description: "O que fazer hoje nos anúncios próprios e no catálogo",
        icon: ListChecks,
      },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    kind: "dropdown",
    items: [
      {
        href: "/dashboard/produtos",
        label: "Produtos",
        description: "Cadastro fiscal e custo por SKU",
        icon: Boxes,
        section: "Cadastros",
      },
      {
        href: "/dashboard/fornecedores",
        label: "Fornecedores",
        description: "Quem fornece cada produto",
        icon: Factory,
        section: "Cadastros",
      },
      {
        href: "/dashboard/inventory",
        label: "Estoque",
        description: "Saldo, movimentações e inventário",
        icon: Warehouse,
        section: "Estoque e compras",
      },
      {
        href: "/dashboard/compras",
        label: "Compras",
        description: "Análise por fornecedor e kanban de reposição",
        icon: ShoppingCart,
        section: "Estoque e compras",
      },
      {
        href: "/dashboard/operacoes-full",
        label: "Agendamentos",
        contextLabel: "Agendamentos Full",
        description: "Kanban de agendamento e coleta",
        icon: Kanban,
        section: "Full",
      },
      {
        href: "/dashboard/envios-full",
        label: "Custo de coleta",
        contextLabel: "Custo de coleta Full",
        description: "Quanto custa cada unidade enviada",
        icon: Truck,
        section: "Full",
      },
    ],
  },
  {
    id: "analises",
    label: "Análises",
    kind: "dropdown",
    items: [
      {
        href: "/dashboard/catalog-report",
        label: "Catálogo",
        description: "Mudanças de competição no catálogo",
        icon: ChartNoAxesColumn,
      },
      {
        href: "/dashboard/insights",
        label: "Insights",
        description: "Rotação baixa, ruptura, ads e concentração de receita",
        icon: Lightbulb,
      },
      {
        href: "/dashboard/insights/potencial-faturamento",
        label: "Potencial de faturamento",
        description: "Quanto o catálogo faturaria sem ruptura de estoque",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    kind: "dropdown",
    items: [
      {
        href: "/dashboard/dre",
        label: "DRE",
        description: "Resultado mensal — faturamento, custos, impostos e ADS",
        icon: LineChart,
      },
      {
        href: "/dashboard/lucratividade",
        label: "Lucratividade",
        description: "Margem real das vendas por anúncio",
        icon: TrendingUp,
      },
      {
        href: "/dashboard/calculadora",
        label: "Calculadora",
        description: "Margem de qualquer anúncio no preço que você quiser",
        icon: Calculator,
      },
      {
        href: "/dashboard/tributario",
        label: "Tributário",
        description: "Apuração fiscal mensal — Lucro Real ou Simples Nacional",
        icon: Scale,
        matchHrefs: [
          "/dashboard/relatorio-tributario",
          "/dashboard/simples-nacional",
        ],
      },
    ],
  },
  {
    id: "configuracoes",
    label: "Configurações",
    kind: "account",
    items: [
      {
        href: "/dashboard/configuracoes/empresa",
        label: "Empresa",
        description: "Regime tributário (Lucro Real ou Simples Nacional)",
        icon: Building2,
      },
      {
        href: "/dashboard/configuracoes/planejamento",
        label: "Planejamento",
        description: "Prazos de estoque, sugestão de compra e promoções",
        icon: SlidersHorizontal,
      },
      {
        href: "/dashboard/configuracoes/tributario",
        label: "Alíquotas",
        description: "PIS/COFINS, ICMS interno e CBS/IBS",
        icon: Settings,
      },
    ],
  },
];

export function isDashboardNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Como `isDashboardNavActive`, mas também considera `item.matchHrefs`. */
export function isDashboardNavItemActive(
  pathname: string,
  item: Pick<DashboardNavItem, "href" | "matchHrefs">,
): boolean {
  return [item.href, ...(item.matchHrefs ?? [])].some((href) =>
    isDashboardNavActive(pathname, href),
  );
}

export function isDashboardNavGroupActive(
  pathname: string,
  group: DashboardNavGroup,
): boolean {
  return group.items.some((item) => isDashboardNavItemActive(pathname, item));
}

export const DASHBOARD_TOP_NAV_ITEMS = DASHBOARD_NAV_GROUPS.find(
  (g) => g.kind === "top",
)!.items;

export const DASHBOARD_DROPDOWN_NAV_GROUPS = DASHBOARD_NAV_GROUPS.filter(
  (g) => g.kind === "dropdown",
);

/** Configurações: no menu da conta, à direita da barra. */
export const DASHBOARD_ACCOUNT_NAV_GROUP = DASHBOARD_NAV_GROUPS.find(
  (g) => g.kind === "account",
)!;

/** Os itens do grupo em blocos de seção, na ordem do grupo. */
export function getDashboardNavSections(
  group: DashboardNavGroup,
): DashboardNavSection[] {
  const sections: DashboardNavSection[] = [];
  for (const item of group.items) {
    const label = item.section ?? null;
    const last = sections.at(-1);
    if (last && last.label === label) last.items.push(item);
    else sections.push({ label, items: [item] });
  }
  return sections;
}

/** Atalhos do polegar no mobile — Início, Compras e Full. */
export const DASHBOARD_MOBILE_TAB_ITEMS: Pick<
  DashboardNavItem,
  "href" | "label" | "icon" | "matchHrefs"
>[] = [
  {
    href: "/dashboard",
    label: "Início",
    icon: LayoutGrid,
  },
  {
    href: "/dashboard/compras",
    label: "Compras",
    icon: ShoppingCart,
  },
  {
    href: "/dashboard/operacoes-full",
    label: "Full",
    icon: Kanban,
    matchHrefs: ["/dashboard/envios-full"],
  },
];

export const DASHBOARD_NAV_LAYOUT_STORAGE_KEY = "dashboard-nav-layout";

export type DashboardNavLayout = "categorized" | "flat";

export const DEFAULT_DASHBOARD_NAV_LAYOUT: DashboardNavLayout = "categorized";

/** Todos os itens na ordem de exibição (menu plano). */
export function getAllDashboardNavItems(): DashboardNavItem[] {
  return DASHBOARD_NAV_GROUPS.flatMap((group) => group.items);
}
