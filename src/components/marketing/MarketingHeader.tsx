"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { MarketingMobileNav } from "@/components/marketing/MarketingMobileNav";
import { MarketingNavLink } from "@/components/marketing/MarketingNavLink";
import { OAuthCta } from "@/components/marketing/OauthCta";
import { cn } from "@/lib/utils";

export function MarketingHeader({
  isLoggedIn,
  dashboardHref,
  logoHref = "#topo",
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  logoHref?: string;
}) {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    function onScroll() {
      setSolid(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 -mb-[calc(5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]">
      <div
        className={cn(
          "border-b transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none",
          solid
            ? "border-[var(--border)] bg-white shadow-[0_1px_0_rgba(15,18,31,0.06)]"
            : "border-white/10 bg-transparent",
        )}
      >
        <div className="mx-auto flex h-20 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <a
            href={logoHref}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="ERP 1a1"
          >
            <Image
              src="/logo-bg-blue.png"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-xl object-cover"
              priority
            />
            <span
              className={cn(
                "text-lg font-semibold tracking-tight",
                solid ? "text-[var(--foreground)]" : "text-white",
              )}
            >
              ERP 1a1
            </span>
          </a>

          <nav
            aria-label="Funcionalidades"
            className="hidden min-w-0 flex-1 items-center gap-6 lg:flex xl:gap-8"
          >
            {MARKETING_NAV_LINKS.map((link) => (
              <MarketingNavLink key={link.href} href={link.href} onDark={!solid}>
                {link.label}
              </MarketingNavLink>
            ))}
            <MarketingNavLink href="/precos" onDark={!solid}>
              Preços
            </MarketingNavLink>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <OAuthCta
              isLoggedIn={isLoggedIn}
              dashboardHref={dashboardHref}
              size="sm"
              onDark={!solid}
              className="hidden h-10 px-5 text-sm lg:inline-flex"
            />
            <MarketingMobileNav
              onDark={!solid}
              isLoggedIn={isLoggedIn}
              dashboardHref={dashboardHref}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
