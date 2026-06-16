"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LayoutGrid, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDashboardNavLayout } from "@/hooks/use-dashboard-nav-layout";
import {
  DASHBOARD_DROPDOWN_NAV_GROUPS,
  DASHBOARD_TOP_NAV_ITEMS,
  getAllDashboardNavItems,
  type DashboardNavGroup,
  type DashboardNavItem,
  isDashboardNavActive,
  isDashboardNavGroupActive,
} from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

function NavPopoverLink({
  item,
  active,
  onNavigate,
}: {
  item: DashboardNavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      role="menuitem"
      title={item.title}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-[var(--accent)] font-medium text-[var(--accent-foreground)]"
          : "text-[var(--foreground)] hover:bg-[var(--muted)]",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.badge ? (
        <Badge
          variant={item.badge.variant}
          className="px-1.5 py-0 text-[10px]"
        >
          {item.badge.label}
        </Badge>
      ) : null}
    </Link>
  );
}

function NavFlatLink({
  item,
  active,
}: {
  item: DashboardNavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const isCatalog = item.href === "/dashboard/catalog-report";

  return (
    <Button variant="ghost" size="sm" asChild>
      <Link
        href={item.href}
        title={item.title}
        className={cn(
          "gap-2",
          active && "bg-[var(--accent)] text-[var(--accent-foreground)]",
        )}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="size-4" aria-hidden />
        {isCatalog ? (
          <>
            <span className="hidden xl:inline">Relatório catálogo</span>
            <span className="xl:hidden">Catálogo</span>
          </>
        ) : (
          item.label
        )}
        {item.badge ? (
          <Badge variant={item.badge.variant} className="px-1.5 py-0 text-[10px]">
            {item.badge.label}
          </Badge>
        ) : null}
      </Link>
    </Button>
  );
}

function NavDropdownGroup({
  group,
  pathname,
}: {
  group: DashboardNavGroup;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const groupActive = isDashboardNavGroupActive(pathname, group);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "gap-1",
            groupActive && "bg-[var(--accent)] text-[var(--accent-foreground)]",
          )}
        >
          {group.label}
          <ChevronDown
            className={cn(
              "size-4 opacity-70 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="menu"
        aria-label={group.label}
        align="start"
        className="min-w-[12rem] p-1.5"
      >
        <div className="flex flex-col gap-0.5">
          {group.items.map((item) => (
            <NavPopoverLink
              key={item.href}
              item={item}
              active={isDashboardNavActive(pathname, item.href)}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NavLayoutToggle() {
  const { layout, toggleLayout } = useDashboardNavLayout();
  const isCategorized = layout === "categorized";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="ml-auto size-7 shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      onClick={toggleLayout}
      aria-label={
        isCategorized
          ? "Mostrar menu completo sem categorias"
          : "Mostrar menu por categorias"
      }
      title={
        isCategorized
          ? "Menu completo (todos os links)"
          : "Menu por categorias"
      }
    >
      {isCategorized ? (
        <List className="size-3.5" aria-hidden />
      ) : (
        <LayoutGrid className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

function CategorizedNav({ pathname }: { pathname: string }) {
  return (
    <>
      {DASHBOARD_TOP_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isDashboardNavActive(pathname, item.href);

        return (
          <Button key={item.href} variant="ghost" size="sm" asChild>
            <Link
              href={item.href}
              className={cn(
                "gap-2",
                active && "bg-[var(--accent)] text-[var(--accent-foreground)]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          </Button>
        );
      })}
      {DASHBOARD_DROPDOWN_NAV_GROUPS.map((group) => (
        <NavDropdownGroup key={group.id} group={group} pathname={pathname} />
      ))}
    </>
  );
}

function FlatNav({ pathname }: { pathname: string }) {
  return (
    <>
      {getAllDashboardNavItems().map((item) => (
        <NavFlatLink
          key={item.href}
          item={item}
          active={isDashboardNavActive(pathname, item.href)}
        />
      ))}
    </>
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const { layout } = useDashboardNavLayout();

  return (
    <nav
      className={cn(
        "mt-3 hidden border-t border-[var(--border)] pt-3 sm:flex",
        layout === "flat"
          ? "flex-wrap items-center gap-1"
          : "items-center gap-0.5",
      )}
      aria-label="Principal"
    >
      {layout === "categorized" ? (
        <CategorizedNav pathname={pathname} />
      ) : (
        <FlatNav pathname={pathname} />
      )}
      <NavLayoutToggle />
    </nav>
  );
}
