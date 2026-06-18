import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ChartNoAxesColumn,
  Kanban,
  LayoutGrid,
  LineChart,
  Package,
  Scale,
  Settings,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { DRE_DISCLAIMER_MENU } from "@/lib/dre-disclaimer";

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
        label: "Anúncios",
        description: "Gerencie os anúncios do Mercado Livre",
        icon: Package,
      },
      {
        href: "/dashboard/resumo",
        label: "Resumo",
        description: "Painéis operacionais e alertas rápidos",
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
        href: "/dashboard/inventory",
        label: "Estoque",
        description: "Acompanhe o estoque dos produtos",
        icon: Warehouse,
      },
      {
        href: "/dashboard/compras",
        label: "Compras",
        description: "Analise reposição por fornecedor",
        icon: ShoppingCart,
      },
      {
        href: "/dashboard/operacoes",
        label: "Operações",
        description: "Fluxo de compra, galpão e Full",
        icon: Kanban,
      },
      {
        href: "/dashboard/produtos",
        label: "Meus produtos",
        description: "Cadastro fiscal e custo por SKU",
        icon: Boxes,
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
        description: "Veja mudanças de competição no catálogo",
        icon: ChartNoAxesColumn,
      },
      {
        href: "/dashboard/lucratividade",
        label: "Lucratividade",
        description: "Margem de contribuição por anúncio",
        icon: TrendingUp,
      },
      {
        href: "/dashboard/dre",
        label: "DRE",
        description: DRE_DISCLAIMER_MENU,
        icon: LineChart,
        title: DRE_DISCLAIMER_MENU,
        badge: { label: "Indisponível", variant: "warning" },
      },
      {
        href: "/dashboard/relatorio-tributario",
        label: "Tributário",
        description: "Apuração fiscal mensal por venda e SKU",
        icon: Scale,
      },
      {
        href: "/dashboard/configuracoes-tributarias",
        label: "Config. tributária",
        description: "Regime, PIS/COFINS e alíquotas ICMS",
        icon: Settings,
      },
    ],
  },
];

export function isDashboardNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isDashboardNavGroupActive(
  pathname: string,
  group: DashboardNavGroup,
): boolean {
  return group.items.some((item) => isDashboardNavActive(pathname, item.href));
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
