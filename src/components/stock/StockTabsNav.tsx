import Link from "next/link";
import { ArrowDownToLine, ClipboardCheck, History, LayoutList, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export type StockTab = "posicao" | "entradas" | "movimentacoes" | "inventario" | "historico";

const TABS: Array<{ id: StockTab; label: string; href: string; icon: typeof LayoutList }> = [
  { id: "posicao", label: "Posição", href: "/dashboard/inventory", icon: LayoutList },
  { id: "entradas", label: "Entradas", href: "/dashboard/inventory/entradas", icon: ArrowDownToLine },
  { id: "movimentacoes", label: "Movimentações", href: "/dashboard/inventory/movimentacoes", icon: ListOrdered },
  { id: "inventario", label: "Inventário", href: "/dashboard/inventory/inventario", icon: ClipboardCheck },
  { id: "historico", label: "Fechamento mensal", href: "/dashboard/inventory/historico", icon: History },
];

/** Abas do Estoque (navegação entre rotas, não estado local). */
export function StockTabsNav({ active, pendingCount = 0 }: { active: StockTab; pendingCount?: number }) {
  return (
    <nav
      aria-label="Seções do estoque"
      className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-1"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              selected
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {tab.label}
            {tab.id === "movimentacoes" && pendingCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--primary-foreground)]">
                {pendingCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
