"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";

export function MarketingMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-9 w-9 text-white hover:bg-white/10 hover:text-white md:hidden"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Abrir menu de funcionalidades"
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <nav aria-label="Funcionalidades" className="flex flex-col">
          {MARKETING_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/precos"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            Preços
          </Link>
        </nav>
      </PopoverContent>
    </Popover>
  );
}
