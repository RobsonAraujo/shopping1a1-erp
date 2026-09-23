import { ArrowRight, Check, X } from "lucide-react";
import { MarketingSection } from "@/components/marketing/MarketingSection";

const PAIRS = [
  {
    problem: "A planilha só sabe o que você digitou.",
    detail: "Tarifa, desconto de tarifa, devolução e ADS chegam depois, na fatura.",
    solution: "Tarifa, ADS e devolução entram da própria fatura ML.",
  },
  {
    problem: "A margem do produto não é a margem do anúncio.",
    detail: "O mesmo SKU roda em clássico e premium, com preços e fretes diferentes.",
    solution: "Margem calculada por anúncio, e também consolidada por SKU.",
  },
  {
    problem: "O anúncio parece lucrativo até o Product Ads entrar.",
    detail: "O TACOS não aparece na conta de margem que a maioria faz.",
    solution: "Pós ADS na coluna ao lado da margem, na mesma linha.",
  },
  {
    problem: "Fechar o mês é reconciliar planilha com extrato.",
    detail: "E quando o número não bate, não dá pra saber qual venda desviou.",
    solution: "DRE fecha com a fatura e cada linha abre a auditoria do cálculo.",
  },
  {
    problem: "Você descobre a ruptura pelo gráfico de vendas caindo.",
    detail: "Quando o estoque zera, a posição do anúncio já caiu junto.",
    solution: "O card de compra nasce antes do estoque acabar, pelo giro real.",
  },
] as const;

export function MarketingProblem() {
  return (
    <MarketingSection
      id="problema"
      surface="card"
      eyebrow="O buraco na conta"
      eyebrowTone="amber"
      title="Vender bem no Mercado Livre não é o mesmo que sobrar dinheiro"
      lead="Faturamento alto com margem negativa é a situação mais comum, e a mais difícil de enxergar, porque os custos que comem o resultado só aparecem depois da venda."
    >
      <ol className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        {PAIRS.map((pair, index) => (
          <li
            key={pair.problem}
            className={
              index > 0 ? "border-t border-[var(--border)]" : undefined
            }
          >
            <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-8">
              <div className="flex gap-3">
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"
                  aria-hidden
                >
                  <X className="size-3" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="font-medium leading-snug text-[var(--foreground)]">
                    {pair.problem}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {pair.detail}
                  </p>
                </div>
              </div>

              <ArrowRight
                className="hidden size-4 shrink-0 text-[var(--muted-foreground)]/40 md:block"
                aria-hidden
              />

              <div className="flex gap-3 rounded-xl bg-emerald-50/60 p-3.5 md:bg-transparent md:p-0">
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                  aria-hidden
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <p className="min-w-0 font-medium leading-snug text-[var(--foreground)]">
                  {pair.solution}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </MarketingSection>
  );
}
