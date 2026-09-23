"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { cn } from "@/lib/utils";

/**
 * Desktop: as cinco páginas de funcionalidade cabiam na barra, mas espremidas
 * e sem contexto. Aqui elas viram um painel com o `hint` de cada uma — o mesmo
 * texto que o drawer mobile já mostrava.
 */
const CLOSE_DELAY_MS = 120;

export function MarketingNavMenu({ onDark = false }: { onDark?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const sectionActive = MARKETING_NAV_LINKS.some(
    (link) => link.href === pathname,
  );

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(
      () => setOpen(false),
      CLOSE_DELAY_MS,
    );
  };

  return (
    <div
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-[15px] font-medium outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)] rounded-sm",
            onDark
              ? cn(
                  "text-white/70 hover:text-white focus-visible:ring-offset-transparent",
                  (open || sectionActive) && "text-white",
                )
              : cn(
                  "text-[var(--muted-foreground)] hover:text-[var(--primary)]",
                  (open || sectionActive) &&
                    "font-semibold text-[var(--primary)]",
                ),
          )}
        >
          Recursos
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={14}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-2xl border-[var(--border)] p-2 shadow-[0_1px_2px_rgba(15,18,31,0.04),0_24px_48px_-24px_rgba(15,18,31,0.35)]"
        >
          <ul className="grid gap-0.5">
            {MARKETING_NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--muted)]",
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
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
