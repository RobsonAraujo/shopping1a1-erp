"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function MarketingNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap text-[15px] transition-colors hover:text-[var(--primary)]",
        active
          ? "font-semibold text-[var(--primary)]"
          : "font-medium text-[var(--muted-foreground)]",
      )}
    >
      {children}
    </Link>
  );
}
