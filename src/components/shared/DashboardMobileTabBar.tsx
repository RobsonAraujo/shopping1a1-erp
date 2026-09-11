"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DASHBOARD_MOBILE_TAB_ITEMS,
  isDashboardNavItemActive,
} from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

export function DashboardMobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card)] pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Atalhos"
    >
      <ul className="grid h-14 grid-cols-3">
        {DASHBOARD_MOBILE_TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isDashboardNavItemActive(pathname, item);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active
                    ? "text-[var(--primary)]"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
