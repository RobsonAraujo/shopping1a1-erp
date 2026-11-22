"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LogOut, Store } from "lucide-react";
import { NavPendingHint } from "@/components/shared/NavPendingHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DASHBOARD_ACCOUNT_NAV_GROUP,
  DASHBOARD_DROPDOWN_NAV_GROUPS,
  DASHBOARD_TOP_NAV_ITEMS,
  type DashboardNavGroup,
  type DashboardNavItem,
  getDashboardNavSections,
  isDashboardNavGroupActive,
  isDashboardNavItemActive,
} from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

const SECTION_LABEL_CLASS =
  "px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";

/**
 * Aberto/fechado de um menu da barra. A navegação terminou: fecha. Ajuste no
 * render, e não em effect, para não pintar um quadro com a página nova e o menu
 * ainda aberto.
 */
function useNavMenuOpen(pathname: string) {
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }
  return [open, setOpen] as const;
}

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
        "group relative flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors",
        active
          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
          : "text-[var(--foreground)] hover:bg-[var(--muted)]",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
          active
            ? "bg-[var(--primary)]/10 text-[var(--primary)]"
            : "bg-[var(--muted)] text-[var(--muted-foreground)] group-hover:bg-[var(--card)] group-hover:text-[var(--foreground)]",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 pt-px">
        <span className="flex items-center gap-2 text-sm font-medium leading-tight">
          {item.label}
          {item.badge ? (
            <Badge
              variant={item.badge.variant}
              className="px-1.5 py-0 text-[10px]"
            >
              {item.badge.label}
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]">
          {item.description}
        </span>
      </span>
      <NavPendingHint className="top-1.5 right-1.5" />
    </Link>
  );
}

/** Os itens de um grupo, com subtítulo e linha entre as seções. */
function NavGroupSections({
  group,
  pathname,
  onNavigate,
}: {
  group: DashboardNavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  return getDashboardNavSections(group).map((section, index) => (
    <div
      key={section.label ?? index}
      role="group"
      aria-label={section.label ?? undefined}
      className={cn(
        "flex flex-col gap-0.5",
        index > 0 && "mt-1 border-t border-[var(--border)] pt-1",
      )}
    >
      {section.label ? (
        <p className={SECTION_LABEL_CLASS} aria-hidden>
          {section.label}
        </p>
      ) : null}
      {section.items.map((item) => (
        <NavPopoverLink
          key={item.href}
          item={item}
          active={isDashboardNavItemActive(pathname, item)}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  ));
}

function NavDropdownGroup({
  group,
  pathname,
}: {
  group: DashboardNavGroup;
  pathname: string;
}) {
  const [open, setOpen] = useNavMenuOpen(pathname);
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
        className="w-80 max-w-[calc(100vw-2rem)] p-1.5"
      >
        <NavGroupSections
          group={group}
          pathname={pathname}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function TopNavLink({
  item,
  pathname,
}: {
  item: DashboardNavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const active = isDashboardNavItemActive(pathname, item);

  return (
    <Button variant="ghost" size="sm" asChild>
      <Link
        href={item.href}
        className={cn(
          "relative shrink-0 gap-2",
          active && "bg-[var(--accent)] text-[var(--accent-foreground)]",
        )}
        aria-current={active ? "page" : undefined}
        aria-label={item.shortLabel ? item.label : undefined}
        title={item.shortLabel ? item.label : (item.title ?? item.description)}
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
}

/**
 * Barra do topo: os links do dia a dia (Início, Ações do dia), um divisor e as
 * áreas em menus. Configurações e Sair ficam no menu da conta, à direita.
 */
export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      className="ml-4 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:flex lg:ml-6 [&::-webkit-scrollbar]:hidden"
      aria-label="Principal"
    >
      {DASHBOARD_TOP_NAV_ITEMS.map((item) => (
        <TopNavLink key={item.href} item={item} pathname={pathname} />
      ))}
      <span
        aria-hidden
        className="mx-2 h-5 w-px shrink-0 bg-[var(--border)]"
      />
      {DASHBOARD_DROPDOWN_NAV_GROUPS.map((group) => (
        <NavDropdownGroup key={group.id} group={group} pathname={pathname} />
      ))}
    </nav>
  );
}

/**
 * Menu da conta (nome da loja ▾): Configurações e Sair. Só a partir de `sm`;
 * no celular os dois moram no menu lateral.
 */
export function DashboardAccountMenu({ accountName }: { accountName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useNavMenuOpen(pathname);
  const group = DASHBOARD_ACCOUNT_NAV_GROUP;
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
          aria-label={`Conta: ${accountName}`}
          title={accountName}
          className={cn(
            "hidden shrink-0 gap-1.5 sm:inline-flex",
            groupActive && "bg-[var(--accent)] text-[var(--accent-foreground)]",
          )}
        >
          <Store className="size-4" aria-hidden />
          <span className="hidden max-w-[10rem] truncate lg:inline xl:max-w-[12rem]">
            {accountName}
          </span>
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
        aria-label="Conta"
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] p-1.5"
      >
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
            Conectado como
          </p>
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
            {accountName}
          </p>
        </div>
        <div
          role="group"
          aria-label={group.label}
          className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-1"
        >
          <p className={SECTION_LABEL_CLASS} aria-hidden>
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavPopoverLink
              key={item.href}
              item={item}
              active={isDashboardNavItemActive(pathname, item)}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
        <form
          action="/api/auth/mercadolibre/signout"
          method="post"
          className="mt-1 border-t border-[var(--border)] pt-1"
        >
          <button
            type="submit"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
              <LogOut className="size-4" aria-hidden />
            </span>
            Sair
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
