"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function MarketingNavLink({
  href,
  onDark = false,
  children,
}: {
  href: string;
  onDark?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap text-[15px] font-medium transition-colors",
        onDark
          ? active
            ? "text-white"
            : "text-white/70 hover:text-white"
          : active
            ? "font-semibold text-[var(--primary)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--primary)]",
      )}
    >
      {children}
    </Link>
  );
}
