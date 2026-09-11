"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/configuracoes/empresa", label: "Empresa" },
  { href: "/dashboard/configuracoes/planejamento", label: "Planejamento" },
  { href: "/dashboard/configuracoes/tributario", label: "Tributário" },
] as const;

export function ConfiguracoesSubnav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções de configurações"
      className="flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/60 p-1"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium transition-colors",
              active
                ? "bg-[var(--card)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
