import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesColumn,
  Kanban,
  Lightbulb,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { Card } from "@/components/ui/card";

const SHORTCUTS = [
  {
    href: "/dashboard/compras",
    label: "Compras",
    description: "Fornecedores e kanban",
    icon: ShoppingCart,
  },
  {
    href: "/dashboard/inventory",
    label: "Estoque",
    description: "Galpão e Full",
    icon: Warehouse,
  },
  {
    href: "/dashboard/insights",
    label: "Insights",
    description: "Ruptura e rotação",
    icon: Lightbulb,
  },
  {
    href: "/dashboard/lucratividade",
    label: "Lucratividade",
    description: "Margem por anúncio",
    icon: TrendingUp,
  },
  {
    href: "/dashboard/catalog-report",
    label: "Catálogo",
    description: "Competição de preço",
    icon: ChartNoAxesColumn,
  },
  {
    href: "/dashboard/operacoes-full",
    label: "Operações Full",
    description: "Agendamento e coleta",
    icon: Kanban,
  },
] as const;

export function DashboardHomeShortcuts() {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Atalhos
      </h2>
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-[var(--border)]">
          {SHORTCUTS.map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--muted)]/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)] transition-colors group-hover:bg-[var(--primary)]/10 group-hover:text-[var(--primary)]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {label}
                  </p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {description}
                  </p>
                </div>
                <ArrowRight
                  className="size-4 shrink-0 text-[var(--muted-foreground)]/50 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
