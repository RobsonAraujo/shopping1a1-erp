import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MARKETING_NAV_LINKS } from "@/components/marketing/marketing-nav-links";
import { formatFinancialPercent } from "@/lib/pricing/financial-margin";

export const metadata: Metadata = {
  title: "Página não encontrada",
  // Um 404 indexado só gasta orçamento de rastreio do site.
  robots: { index: false, follow: true },
};

/** Emoji fica em constante: literal solto no JSX vira alvo fácil de lint/format. */
const LOST_BOX = "\u{1F4E6}";

/** A piada só funciona porque é a mesma linguagem do painel: linha, valor, margem. */
const AUDIT_ROWS = [
  { label: "Páginas solicitadas", value: "1" },
  { label: "Páginas encontradas", value: "0" },
] as const;

const SUGGESTIONS = [
  ...MARKETING_NAV_LINKS,
  { href: "/precos", label: "Preços" },
  { href: "/sobre", label: "Sobre" },
] as const;

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="ERP 1a1"
          >
            <Image
              src="/logo-bg-blue.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-cover shadow-sm"
              priority
            />
            <span className="text-lg font-semibold tracking-tight text-[var(--primary)]">
              ERP 1a1
            </span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
          {/* A caixa perdida é o assunto da página — vem antes de qualquer texto.
              A animação é CSS puro (globals.css), então nada disso vira client. */}
          <div className="not-found-stage flex flex-col items-center">
            <span
              aria-hidden
              className="not-found-emoji select-none text-[clamp(4.5rem,18vw,7rem)] leading-none"
            >
              {LOST_BOX}
            </span>
            <span
              aria-hidden
              className="not-found-shadow mt-1 h-2.5 w-24 rounded-[50%] bg-[var(--primary)] opacity-20 blur-[3px]"
            />
          </div>

          <p className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Erro 404
          </p>

          <h1 className="mt-4 text-balance text-[clamp(1.75rem,5vw,2.5rem)] font-bold leading-[1.1] tracking-tight text-[var(--foreground)]">
            Essa página saiu do estoque
          </h1>

          <p className="mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Procuramos em todas as prateleiras e não achamos esse endereço. Ele
            pode ter mudado de lugar, ou veio com um dígito trocado no caminho.
            Acontece até nas melhores planilhas.
          </p>

          {/* Mesmo formato das linhas de auditoria do DRE, inclusive a formatação
              de percentual, que vem da mesma função usada no painel. */}
          <dl className="mt-10 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-left shadow-sm">
            <p className="border-b border-[var(--border)] bg-[var(--background)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Auditoria do erro
            </p>
            <div className="px-5 py-4">
              {AUDIT_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 py-1.5"
                >
                  <dt className="text-sm text-[var(--muted-foreground)]">
                    {row.label}
                  </dt>
                  <dd className="text-sm font-medium tabular-nums text-[var(--foreground)]">
                    {row.value}
                  </dd>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-[var(--border)] pt-3">
                <dt className="text-sm font-semibold text-[var(--foreground)]">
                  Margem de erro
                </dt>
                <dd className="text-lg font-bold tabular-nums text-rose-600">
                  {formatFinancialPercent(100)}
                </dd>
              </div>
            </div>
          </dl>

          {/* Quem cai num 404 vindo de busca está deslogado: o primário leva
              para a home pública, não para uma tela que vai pedir login. */}
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/">
                Voltar ao início
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/dashboard">
                <LayoutDashboard className="size-4" aria-hidden />
                Ir para o painel
              </Link>
            </Button>
          </div>

          <div className="mt-12 w-full border-t border-[var(--border)] pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Talvez você procurasse
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
