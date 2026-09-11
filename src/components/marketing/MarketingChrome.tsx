import Image from "next/image";
import Link from "next/link";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { MarketingMobileNav } from "@/components/marketing/MarketingMobileNav";
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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#152456]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a href={logoHref} className="flex shrink-0 items-center gap-2">
          <Image
            src="/logo-bg-blue.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg object-cover shadow-sm"
            priority
          />
          <span className="font-semibold tracking-tight text-white">
            ERP 1a1
          </span>
        </a>
        <nav
          aria-label="Funcionalidades"
          className="hidden items-center gap-4 lg:flex"
        >
          {MARKETING_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-white transition-colors hover:text-cyan-200"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/precos"
            className="text-sm font-semibold text-white transition-colors hover:text-cyan-200"
          >
            Preços
          </Link>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <MarketingMobileNav />
          <OAuthCta
            isLoggedIn={isLoggedIn}
            dashboardHref={dashboardHref}
            size="sm"
            onDark
          />
        </div>
      </div>
    </header>
  );
}

function FooterComingSoon() {
  return (
    <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      Em breve
    </span>
  );
}

const FOOTER_PRODUCT_LINKS = [
  { href: "/precos", label: "Preços" },
  { href: "/#como-comeca", label: "Como funciona" },
  { href: "/#faq", label: "Perguntas frequentes" },
] as const;

const FOOTER_COMPANY_LINKS = ["Sobre", "Contato", "Privacidade", "Termos de uso"] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Image
                src="/logo-bg-blue.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-md object-cover"
              />
              <span className="font-semibold tracking-tight text-[var(--foreground)]">
                ERP 1a1
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-[var(--muted-foreground)]">
              Painel para vendedores Mercado Livre — lucratividade, tributário,
              DRE e kanban de compras e Full.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Funcionalidades</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {MARKETING_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Produto</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {FOOTER_PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Empresa</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {FOOTER_COMPANY_LINKS.map((label) => (
                <li key={label} className="flex items-center text-[var(--muted-foreground)]/70">
                  <span className="cursor-not-allowed">{label}</span>
                  <FooterComingSoon />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-[var(--border)] pt-8 text-center text-xs text-[var(--muted-foreground)]">
          ERP 1a1 · painel para vendedores Mercado Livre
        </p>
      </div>
    </footer>
  );
}
