"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavPendingHint } from "@/components/shared/NavPendingHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DASHBOARD_DROPDOWN_NAV_GROUPS,
  DASHBOARD_TOP_NAV_ITEMS,
  type DashboardNavGroup,
  type DashboardNavItem,
  isDashboardNavGroupActive,
  isDashboardNavItemActive,
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
      onClick={(event) => {
        // O menu fica aberto durante a navegação, senão o link sairia da tela e
        // levaria o indicador junto: quase todas as páginas moram nestes menus.
        // Quem fecha é a troca de rota. Os casos sem troca de rota (link da
        // própria página, abrir em nova aba) fecham aqui.
        if (active || event.metaKey || event.ctrlKey || event.shiftKey) {
          onNavigate();
        }
      }}
      className={cn(
        "relative flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
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
      <NavPendingHint className="top-1 right-1" />
    </Link>
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

  // A navegação terminou: fecha o menu. Ajuste no render, e não em effect, para
  // não pintar um quadro com a página nova e o menu ainda aberto.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

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
            "shrink-0 gap-1",
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
              active={isDashboardNavItemActive(pathname, item)}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}


function CategorizedNav({ pathname }: { pathname: string }) {
  return (
    <>
      {DASHBOARD_TOP_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isDashboardNavItemActive(pathname, item);

        return (
          <Button key={item.href} variant="ghost" size="sm" asChild>
            <Link
              href={item.href}
              className={cn(
                "relative shrink-0 gap-2",
                active && "bg-[var(--accent)] text-[var(--accent-foreground)]",
              )}
              aria-current={active ? "page" : undefined}
              aria-label={item.shortLabel ? item.label : undefined}
              title={item.shortLabel ? item.label : item.title}
            >
              <Icon className="size-4" aria-hidden />
              {item.shortLabel ? (
                <>
                  <span className="hidden xl:inline">{item.label}</span>
                  <span className="xl:hidden">{item.shortLabel}</span>
                </>
              ) : (
                item.label
              )}
              <NavPendingHint className="top-1 right-1" />
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

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      className="ml-4 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:flex lg:ml-6 [&::-webkit-scrollbar]:hidden"
      aria-label="Principal"
    >
      <CategorizedNav pathname={pathname} />
    </nav>
  );
}
