import { Lightbulb, ShoppingCart, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Truck,
    accent: {
      bar: "bg-sky-500",
      wrap: "border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-white",
      icon: "bg-sky-100 text-sky-700",
      chip: "bg-sky-100 text-sky-800",
    },
    title: "Operações Full",
    lead: "O Full deixa de ser planilha paralela. Você vê o fluxo de envio e o custo real de cada coleta.",
    points: [
      "Kanban de agendamento e coleta — o que falta enviar e o que já saiu",
      "Relatório de envios com custo de coleta por unidade",
      "Esses custos entram no DRE, sem digitação duplicada",
    ],
    chips: ["Kanban", "Custo por unidade"],
  },
  {
    icon: ShoppingCart,
    accent: {
      bar: "bg-amber-400",
      wrap: "border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-white",
      icon: "bg-amber-100 text-amber-800",
      chip: "bg-amber-100 text-amber-900",
    },
    title: "Compras e reposição",
    lead: "Decidir o pedido com o fornecedor olhando giro e ruptura — não só o estoque de ontem.",
    points: [
      "Resumo por fornecedor: o que está em falta e o que está parado",
      "Ciclos de reposição no kanban, do pedido à chegada",
      "Estoque de armazém alinhado ao que o Mercado Livre ainda vende",
    ],
    chips: ["Fornecedor", "Kanban"],
  },
  {
    icon: Lightbulb,
    accent: {
      bar: "bg-violet-500",
      wrap: "border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-white",
      icon: "bg-violet-100 text-violet-700",
      chip: "bg-violet-100 text-violet-800",
    },
    title: "Insights",
    lead: "Onde o dinheiro trava: SKU parado, receita concentrada em poucos anúncios, ads e faturamento perdido por falta de estoque.",
    points: [
      "Rotação baixa — capital preso em produto que não sai",
      "Concentração de receita (Pareto) para não depender de um anúncio",
      "Potencial de faturamento se não houvesse ruptura de estoque",
    ],
    chips: ["Giro", "Ads", "Potencial"],
  },
] as const;

export function MarketingMoreInPanel() {
  return (
    <section
      id="mais"
      className="scroll-mt-20 bg-white px-4 py-16 sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
          Operação no dia a dia
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Full, compras e insights — o que sobra depois da margem
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Lucratividade e tributário mostram se o anúncio paga. Esta parte do
          painel mostra se a operação consegue entregar: coletar no Full, pedir
          na hora certa e enxergar SKU parado ou ruptura.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {FEATURES.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className={cn(
                  "flex flex-col overflow-hidden rounded-2xl border shadow-sm",
                  item.accent.wrap,
                )}
              >
                <div className={cn("h-1.5 w-full", item.accent.bar)} />
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <span
                    className={cn(
                      "inline-flex size-11 items-center justify-center rounded-xl",
                      item.accent.icon,
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">
                    {item.lead}
                  </p>
                  <ul className="mt-4 space-y-2.5 text-sm text-[var(--muted-foreground)]">
                    {item.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span
                          className={cn(
                            "mt-2 size-1.5 shrink-0 rounded-full",
                            item.accent.bar,
                          )}
                          aria-hidden
                        />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {item.chips.map((chip) => (
                      <span
                        key={chip}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                          item.accent.chip,
                        )}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
