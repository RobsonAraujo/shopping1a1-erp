import { cn } from "@/lib/utils";
import { CtaReassurance } from "@/components/marketing/CtaBand";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { OAuthCta } from "@/components/marketing/OauthCta";

const STEPS = [
  {
    n: "01",
    title: "Conecte a conta do Mercado Livre",
    body: "Testar grátis abre o OAuth oficial — sem senha nova, sem cartão. A organização da sua loja é criada na hora; os tokens ficam criptografados no servidor.",
  },
  {
    n: "02",
    title: "Cadastre o que a ML não sabe",
    body: "Custo de nota, ST e regime (lucro real ou simples nacional) no cadastro. Lucratividade e tributário passam a usar o mesmo número — sem planilha paralela.",
  },
  {
    n: "03",
    title: "Acompanhe o mês",
    body: "Catálogo, fatura, Full e vendas entram sozinhos. Você lê margem, apuração por SKU, DRE e o kanban de compras no mesmo painel.",
  },
] as const;

export function MarketingHowItStarts({
  isLoggedIn,
  dashboardHref,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
}) {
  return (
    <MarketingSection
      id="como-comeca"
      surface="base"
      width="narrow"
      align="center"
      eyebrow="Começar"
      title="Três passos. Sem onboarding de planilha."
      lead="Autoriza a loja, informa custo e regime — o resto o painel calcula."
    >
      <ol className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        {STEPS.map((step, i) => (
          <li
            key={step.n}
            className={cn(
              "grid gap-4 px-5 py-7 sm:grid-cols-[4.5rem_1fr] sm:gap-6 sm:px-8",
              i < STEPS.length - 1 && "border-b border-[var(--border)]",
            )}
          >
            <p
              className="font-mono text-3xl font-bold tabular-nums leading-none text-[#1b2d6f]/15 sm:text-4xl"
              aria-hidden
            >
              {step.n}
            </p>
            <div>
              <h3 className="text-lg font-semibold text-[var(--primary)]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-[15px]">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-9 flex flex-col items-center gap-4">
        <OAuthCta isLoggedIn={isLoggedIn} dashboardHref={dashboardHref} />
        {!isLoggedIn ? <CtaReassurance /> : null}
      </div>
    </MarketingSection>
  );
}
