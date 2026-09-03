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
    body: "Catálogo, fatura, Full e vendas entram sozinhos. Você lê margem, apuração por SKU e DRE no mesmo painel.",
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
    <section className="bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">
          Começar
        </p>
        <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Três passos. Sem onboarding de planilha.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Autoriza a loja, informa custo e regime, e o resto o painel calcula.
        </p>

        <ol className="mt-10 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              className="grid gap-4 px-5 py-6 sm:grid-cols-[4.5rem_1fr] sm:gap-6 sm:px-8 sm:py-8"
              style={
                i < STEPS.length - 1
                  ? { borderBottom: "1px solid var(--border)" }
                  : undefined
              }
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

        <div className="mt-8 flex flex-col items-center gap-3">
          <OAuthCta isLoggedIn={isLoggedIn} dashboardHref={dashboardHref} />
          {!isLoggedIn ? (
            <p className="text-center text-sm text-[var(--muted-foreground)]">
              Começa no passo 01 · sem cartão · sem senha nova
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
