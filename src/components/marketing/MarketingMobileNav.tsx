"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { cn } from "@/lib/utils";

export function MarketingMobileNav({
  onDark = false,
  isLoggedIn,
  dashboardHref,
}: {
  onDark?: boolean;
  isLoggedIn: boolean;
  dashboardHref: string;
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
          className={cn(
            "size-10 lg:hidden",
            onDark
              ? "text-white hover:bg-white/10 hover:text-white"
              : "text-[var(--foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Abrir menu"
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="marketing-nav-overlay fixed inset-0 z-[110] bg-black/45 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="marketing-nav-drawer fixed inset-y-0 right-0 z-[110] flex h-dvh w-[min(22rem,100vw)] flex-col bg-[var(--card)] shadow-[-16px_0_40px_-24px_rgba(15,18,31,0.45)] outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
              Menu
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Fechar menu"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <nav aria-label="Funcionalidades" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3">
            {MARKETING_NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "marketing-nav-item rounded-2xl px-3 py-3.5 transition-colors hover:bg-[var(--muted)]",
                    active && "bg-[var(--muted)]",
                  )}
                >
                  <span className="block text-[15px] font-semibold text-[var(--foreground)]">
                    {link.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                    {link.hint}
                  </span>
                </Link>
              );
            })}
            <Link
              href="/precos"
              onClick={() => setOpen(false)}
              aria-current={pathname === "/precos" ? "page" : undefined}
              className={cn(
                "marketing-nav-item rounded-2xl px-3 py-3.5 text-[15px] font-semibold transition-colors hover:bg-[var(--muted)]",
                pathname === "/precos" && "bg-[var(--muted)]",
              )}
            >
              Preços
            </Link>
          </nav>

          <div className="marketing-nav-item border-t border-[var(--border)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <OAuthCta
              isLoggedIn={isLoggedIn}
              dashboardHref={dashboardHref}
              className="w-full"
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
