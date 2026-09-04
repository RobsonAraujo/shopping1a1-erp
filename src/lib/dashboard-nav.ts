import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Building2,
  ChartNoAxesColumn,
  Kanban,
  LayoutGrid,
  Lightbulb,
  LineChart,
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
};

export type DashboardNavGroup = {
  id: string;
  /** Rótulo do dropdown desktop / cabeçalho mobile. Vazio para topo fixo. */
  label: string;
  kind: "top" | "dropdown";
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
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    kind: "dropdown",
    items: [
      {
        href: "/dashboard/fornecedores",
        label: "Meus Fornecedores",
        description: "Cadastro de fornecedores",
        icon: Truck,
      },
      {
        href: "/dashboard/produtos",
        label: "Meus produtos",
        description: "Cadastro fiscal e custo por SKU",
        icon: Boxes,
      },
      {
        href: "/dashboard/inventory",
        label: "Estoque",
        description: "Acompanhe o estoque dos produtos",
        icon: Warehouse,
      },
      {
        href: "/dashboard/compras",
        label: "Compras",
        description: "Análise por fornecedor e kanban de reposição",
        icon: ShoppingCart,
      },
    ],
  },
  {
    id: "full",
    label: "Full",
    kind: "dropdown",
    items: [
      {
        href: "/dashboard/operacoes-full",
        label: "Operações Full",
        description: "Kanban de agendamento e coleta Full",
        icon: Kanban,
      },
      {
        href: "/dashboard/envios-full",
        label: "Relatório de Envios",
        description: "Custo de coleta ao Full por unidade enviada",
        icon: Truck,
      },
    ],
  },
  {
    id: "analises",
    label: "Análises",
    kind: "dropdown",
    items: [
      {
        href: "/dashboard/lucratividade",
        label: "Lucratividade",
        description: "Margem de contribuição por anúncio",
        icon: TrendingUp,
      },
      {
        href: "/dashboard/catalog-report",
        label: "Relatório de Catálogo",
        description: "Veja mudanças de competição no catálogo",
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
    kind: "dropdown",
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
        label: "Config. tributária",
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
  item: DashboardNavItem,
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

export const DASHBOARD_NAV_LAYOUT_STORAGE_KEY = "dashboard-nav-layout";

export type DashboardNavLayout = "categorized" | "flat";

export const DEFAULT_DASHBOARD_NAV_LAYOUT: DashboardNavLayout = "categorized";

/** Todos os itens na ordem de exibição (menu plano). */
export function getAllDashboardNavItems(): DashboardNavItem[] {
  return DASHBOARD_NAV_GROUPS.flatMap((group) => group.items);
}
