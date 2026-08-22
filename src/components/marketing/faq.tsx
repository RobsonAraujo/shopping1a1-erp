import { ChevronDown } from "lucide-react";

const FAQ = [
  {
    q: "Como faço para entrar?",
    a: "Não há senha do ERP. Você autoriza o aplicativo com a conta oficial do Mercado Livre (OAuth). Os tokens ficam criptografados no servidor — não pedimos usuário e senha da ML.",
  },
  {
    q: "O teste é gratuito? Preciso de cartão?",
    a: "Sim. Ao conectar a loja, a organização entra em período de trial. Nesta fase não há cobrança automática nem cadastro de cartão.",
  },
  {
    q: "O relatório tributário substitui o contador?",
    a: "Não. A apuração estimada (débitos, créditos, a recolher) apoia o fechamento de lucro real. A responsabilidade fiscal permanece com você e o escritório contábil. O ERP não emite nota fiscal.",
  },
  {
    q: "Serve só para lucro real?",
    a: "Não. Você escolhe o regime da empresa — Lucro Real ou Simples Nacional — em Configurações. No Simples, o painel usa a alíquota efetiva do DAS que você informa para calcular margem e precificação, sem pedir ICMS, ST ou monofásico (que não se aplicam a esse regime). A apuração fiscal detalhada por venda e SKU (débitos, créditos, ICMS-DIFAL) continua específica do Lucro Real. Lucratividade, catálogo, DRE, Full e compras servem a qualquer regime.",
  },
  {
    q: "Meus dados ficam misturados com os de outro vendedor?",
    a: "Não. Cada loja vira uma organização isolada. Consultas de negócio são filtradas por organização; o login do Mercado Livre define o tenant.",
  },
];

export function MarketingFaq() {
  return (
    <section className="bg-[var(--background)] px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">
          Dúvidas
        </p>
        <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Perguntas frequentes
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[var(--muted-foreground)]">
          Respostas objetivas sobre acesso, trial e o que o painel cobre.
        </p>
        <div className="mt-10 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group px-5 py-1 open:bg-[var(--muted)]/25"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-left font-medium text-[var(--foreground)] marker:content-none [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-4 pr-8 text-sm leading-relaxed text-[var(--muted-foreground)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
