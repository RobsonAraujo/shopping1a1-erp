import Image from "next/image";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { MarketingMobileNav } from "@/components/marketing/MarketingMobileNav";
import { MarketingNavLink } from "@/components/marketing/MarketingNavLink";
import { OAuthCta } from "@/components/marketing/OauthCta";

export function MarketingHeader({
  isLoggedIn,
  dashboardHref,
  logoHref = "#topo",
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
  logoHref?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-20 max-w-6xl items-center gap-8 overflow-hidden px-4 sm:px-6">
        <a href={logoHref} className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/logo-bg-blue.png"
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-xl object-cover"
            priority
          />
          <span className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            ERP 1a1
          </span>
        </a>

        <nav
          aria-label="Funcionalidades"
          className="hidden min-w-0 flex-1 items-center gap-6 lg:flex xl:gap-8"
        >
          {MARKETING_NAV_LINKS.map((link) => (
            <MarketingNavLink key={link.href} href={link.href}>
              {link.label}
            </MarketingNavLink>
          ))}
          <MarketingNavLink href="/precos">Preços</MarketingNavLink>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <MarketingMobileNav />
          <OAuthCta
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
            size="sm"
            compactOnMobile
            className={
              isLoggedIn ? "h-8 px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm" : "h-10 px-5 text-sm"
            }
          />
        </div>
      </div>
    </header>
  );
}
