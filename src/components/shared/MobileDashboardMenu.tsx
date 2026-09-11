"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LogOut, Menu, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DASHBOARD_NAV_GROUPS,
  isDashboardNavItemActive,
  type DashboardNavItem,
} from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

function MobileNavLink({
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
      aria-current={active ? "page" : undefined}
      title={item.title}
      onClick={onNavigate}
      className={cn(
        "flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors",
        active
          ? "bg-[var(--muted)]"
          : "text-[var(--foreground)] hover:bg-[var(--muted)]",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[15px] font-semibold leading-none">
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
        <span className="mt-1.5 block text-xs leading-snug text-[var(--muted-foreground)]">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

export function MobileDashboardMenu({
  accountName,
}: {
  accountName?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-10 sm:hidden"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Abrir menu principal"
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="marketing-nav-overlay fixed inset-0 z-[110] bg-black/45 sm:hidden" />
        <DialogPrimitive.Content
          className="marketing-nav-drawer fixed inset-y-0 right-0 z-[110] flex h-dvh w-[min(22rem,100vw)] flex-col bg-[var(--card)] shadow-[-16px_0_40px_-24px_rgba(15,18,31,0.45)] outline-none sm:hidden"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                Menu
              </DialogPrimitive.Title>
              {accountName ? (
                <p className="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">
                  {accountName}
                </p>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Fechar menu"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <nav
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3"
            aria-label="Principal mobile"
          >
            {DASHBOARD_NAV_GROUPS.map((group) => (
              <div key={group.id} className="marketing-nav-item flex flex-col gap-0.5">
                {group.kind === "dropdown" && group.label ? (
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {group.label}
                  </p>
                ) : null}
                {group.items.map((item) => (
                  <MobileNavLink
                    key={item.href}
                    item={item}
                    active={isDashboardNavItemActive(pathname, item)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </div>
            ))}
          </nav>

          <form
            action="/api/auth/mercadolibre/signout"
            method="post"
            className="marketing-nav-item border-t border-[var(--border)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
            >
              <LogOut className="size-4" aria-hidden />
              Sair
            </button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
