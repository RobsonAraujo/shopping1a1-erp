"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { cn } from "@/lib/utils";

export function MarketingMobileNav({ onDark = false }: { onDark?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
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
      </SheetTrigger>
      <SheetContent className="sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-1 pb-8">
          {MARKETING_NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-xl px-3 py-3 transition-colors hover:bg-[var(--muted)]",
                  active && "bg-[var(--muted)]",
                )}
              >
                <span className="block text-sm font-semibold text-[var(--foreground)]">
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
              "mt-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors hover:bg-[var(--muted)]",
              pathname === "/precos" && "bg-[var(--muted)]",
            )}
          >
            Preços
          </Link>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
