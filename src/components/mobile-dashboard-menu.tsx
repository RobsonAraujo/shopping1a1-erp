"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChartNoAxesColumn,
  LogOut,
  Menu,
  Package,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  {
    href: "/dashboard",
    label: "Anúncios",
    description: "Gerencie os anúncios do Mercado Livre",
    icon: Package,
  },
  {
    href: "/dashboard/inventory",
    label: "Estoque",
    description: "Acompanhe o estoque dos produtos",
    icon: Warehouse,
  },
  {
    href: "/dashboard/catalog-report",
    label: "Relatório catálogo",
    description: "Veja mudanças de competição no catálogo",
    icon: ChartNoAxesColumn,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileDashboardMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="border-[var(--border)] sm:hidden"
        aria-controls="mobile-dashboard-menu"
        aria-expanded={open}
        aria-label="Abrir menu principal"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" aria-hidden />
      </Button>

      <div
        className={[
          "fixed inset-0 z-[100] sm:hidden h-screen",
          open ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          className={[
            "absolute inset-0 bg-black/35 transition-opacity duration-200 ease-out",
            open ? "opacity-100" : "opacity-0",
          ].join(" ")}
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
        <aside
          id="mobile-dashboard-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
          className={[
            "absolute right-0 top-0 flex h-screen w-[min(86vw,22rem)] flex-col border-l border-[var(--border)] bg-white shadow-2xl transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "translate-x-full",
          ].join(" ")}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Menu
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                ERP 1a1
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Fechar menu"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="px-4 pb-3 pt-4">
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Acesso rápido às áreas do ERP.
            </p>
          </div>

          <nav
            className="flex flex-1 flex-col gap-1 px-3 bg-white"
            aria-label="Principal mobile"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={[
                    "flex items-start gap-3 rounded-xl px-3 py-3 transition-colors",
                    active
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
                  ].join(" ")}
                >
                  <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium leading-none">
                      {item.label}
                    </span>
                    <span className="mt-1.5 block text-xs leading-snug text-[var(--muted-foreground)]">
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <form
            action="/api/auth/mercadolibre/signout"
            method="post"
            className="border-t border-[var(--border)] p-3"
          >
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
            >
              <LogOut className="size-5" aria-hidden />
              Sair
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
