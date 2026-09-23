import Image from "next/image";
import Link from "next/link";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { LEGAL } from "@/lib/marketing/legal";

export { MarketingHeader } from "@/components/marketing/MarketingHeader";

const FOOTER_PRODUCT_LINKS = [
  { href: "/precos", label: "Preços" },
  { href: "/#calculadora", label: "Calculadora de margem" },
  { href: "/#como-comeca", label: "Como funciona" },
  { href: "/#faq", label: "Perguntas frequentes" },
] as const;

const FOOTER_COMPANY_LINKS = [
  { href: "/sobre", label: "Sobre" },
  { href: "/privacidade", label: "Privacidade" },
  { href: "/termos", label: "Termos de uso" },
] as const;

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
      >
        {label}
      </Link>
    </li>
  );
}

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--card)] px-4 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] pt-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-bg-blue.png"
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-lg object-cover"
              />
              <span className="font-semibold tracking-tight text-[var(--foreground)]">
                {LEGAL.productName}
              </span>
              <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Beta
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--muted-foreground)]">
              Painel de lucratividade, imposto e DRE para quem vende no Mercado
              Livre.
            </p>
            <a
              href={`mailto:${LEGAL.supportEmail}`}
              className="mt-4 inline-block text-sm font-medium text-[var(--primary)] underline decoration-[var(--primary)]/30 underline-offset-4 transition-colors hover:decoration-[var(--primary)]"
            >
              {LEGAL.supportEmail}
            </a>
          </div>

          <FooterColumn title="Recursos">
            {MARKETING_NAV_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href} label={link.label} />
            ))}
          </FooterColumn>

          <FooterColumn title="Produto">
            {FOOTER_PRODUCT_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href} label={link.label} />
            ))}
          </FooterColumn>

          <FooterColumn title="Empresa">
            {FOOTER_COMPANY_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href} label={link.label} />
            ))}
          </FooterColumn>
        </div>

        <div className="mt-12 space-y-3 border-t border-[var(--border)] pt-8">
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            {LEGAL.productName} é um aplicativo independente e não possui
            vínculo, patrocínio ou afiliação com o Mercado Livre. O acesso é
            feito pela autorização oficial (OAuth) da sua conta. O painel apoia
            a apuração fiscal, mas não emite nota fiscal e não substitui o seu
            contador.
          </p>
          <p className="text-xs text-[var(--muted-foreground)]/80">
            © {year} {LEGAL.productName} · painel para vendedores Mercado Livre
          </p>
        </div>
      </div>
    </footer>
  );
}
