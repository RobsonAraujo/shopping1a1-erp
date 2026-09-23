import {
  Building2,
  FileSearch,
  KeyRound,
  Receipt,
  ShieldAlert,
} from "lucide-react";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { cn } from "@/lib/utils";

/**
 * Substituto honesto de "prova social" enquanto o produto está em beta: em vez
 * de depoimento, o que dá pra verificar — de onde vem o número, onde o dado
 * fica e o que o painel explicitamente não faz.
 */
const CARDS = [
  {
    icon: KeyRound,
    title: "Você nunca cria uma senha aqui",
    body: "O acesso é o OAuth oficial do Mercado Livre. O ERP recebe um token de autorização, guardado criptografado no servidor — nunca o seu usuário e senha da ML. Revogar o acesso é um clique, do lado deles.",
    span: "lg:col-span-3",
  },
  {
    icon: Building2,
    title: "Uma loja nunca enxerga a outra",
    body: "Cada conta conectada vira uma organização isolada, e toda consulta de negócio carrega o filtro da organização. Não é só convenção: existe uma trava em runtime que recusa consulta em lote sem esse filtro.",
    span: "lg:col-span-3",
  },
  {
    icon: Receipt,
    title: "O número vem da fatura",
    body: "Tarifa, desconto de tarifa, devolução e ADS são lidos do que o Mercado Livre cobrou — não estimados por uma tabela nossa.",
    span: "lg:col-span-2",
  },
  {
    icon: FileSearch,
    title: "Toda linha abre o cálculo",
    body: "Clicou numa linha do DRE ou do relatório fiscal, vê venda a venda como o valor foi montado. Sem caixa-preta no fechamento.",
    span: "lg:col-span-2",
  },
  {
    icon: ShieldAlert,
    title: "O que o painel não faz",
    body: "Não emite nota fiscal e não substitui o seu contador. A apuração é apoio ao fechamento — a responsabilidade fiscal continua sua e do escritório.",
    span: "lg:col-span-2",
    muted: true,
  },
] as const;

export function MarketingTrust() {
  return (
    <MarketingSection
      id="confianca"
      surface="card"
      eyebrow="Transparência"
      eyebrowTone="emerald"
      title="Por que confiar no número que aparece na tela"
      lead="Ainda somos novos, então não vamos pedir que você acredite em depoimento. Preferimos mostrar de onde vem cada dado, onde ele fica guardado e onde termina a nossa responsabilidade."
    >
      <div className="grid gap-4 lg:grid-cols-6">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className={cn(
                "flex flex-col rounded-2xl border p-6",
                card.span,
                "muted" in card && card.muted
                  ? "border-dashed border-[var(--border)] bg-transparent"
                  : "border-[var(--border)] bg-[var(--card)] shadow-sm",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-xl",
                  "muted" in card && card.muted
                    ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    : "bg-[var(--secondary)] text-[var(--primary)]",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-[var(--primary)]">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                {card.body}
              </p>
            </article>
          );
        })}
      </div>
    </MarketingSection>
  );
}
