import Link from "next/link";
import {
  ChartNoAxesColumn,
  Kanban,
  Lightbulb,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SHORTCUTS.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-[var(--primary)]/30 group-hover:bg-[var(--muted)]/30">
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-[var(--foreground)]">{label}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
