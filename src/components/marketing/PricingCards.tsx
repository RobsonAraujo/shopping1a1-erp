import { BellRing, CheckCircle2, DoorOpen, Sparkles, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OAuthCta } from "@/components/marketing/OauthCta";

/**
 * Antes: um card de beta + dois cards borrados com "R$ ––,––". O placeholder
 * borrado lia como site inacabado. Agora é o que existe de fato (beta) ao lado
 * dos compromissos para quando houver preço, que é o que o visitante quer
 * saber antes de conectar a loja.
 */
const BETA_FEATURES = [
  "Lucratividade por anúncio, com margem pós ADS",
  "DRE mensal com auditoria linha a linha",
  "Apuração de Lucro Real por SKU (PIS/COFINS, ICMS, DIFAL)",
  "Simples Nacional: RBT12, faixa do Anexo I e DAS",
  "Catálogo e concorrência de buybox",
  "Estoque, reposição e relatório de envios Full",
  "Kanban de compras e Full compartilhado com a equipe",
  "Insights de giro, ruptura e concentração de receita",
] as const;

const COMMITMENTS = [
  {
    icon: BellRing,
    title: "Aviso antes, sempre",
    body: "Se um plano pago passar a valer para a sua conta, você é avisado por e-mail e dentro do painel com antecedência.",
  },
  {
    icon: Tag,
    title: "Nenhuma cobrança automática",
    body: "Não existe cartão cadastrado hoje. Sem contratação expressa sua, não há como haver cobrança.",
  },
  {
    icon: DoorOpen,
    title: "Saída sem atrito",
    body: "Você revoga a autorização do app na sua conta do Mercado Livre quando quiser, e pode pedir a exclusão dos dados da organização.",
  },
] as const;

export function PricingCards({
  isLoggedIn,
  dashboardHref,
}: {
  isLoggedIn: boolean;
  dashboardHref: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      {/* Plano ativo */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--primary)] bg-[var(--card)] p-7 shadow-[0_1px_2px_rgba(15,18,31,0.04),0_24px_48px_-28px_rgba(27,45,111,0.4)] sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[var(--primary)]/5 blur-2xl"
          aria-hidden
        />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">
              <Sparkles className="size-4" aria-hidden />
              Beta aberto
            </p>
            <Badge variant="success" dot>
              Ativo agora
            </Badge>
          </div>

          <p className="mt-5 text-5xl font-bold tracking-tight text-[var(--foreground)]">
            Grátis
          </p>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
            Painel completo, sem cartão de crédito, enquanto durar o beta.
          </p>

          <ul className="mt-7 space-y-3">
            {BETA_FEATURES.map((label) => (
              <li
                key={label}
                className="flex items-start gap-2.5 text-sm leading-snug text-[var(--foreground)]"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
                {label}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <OAuthCta
              isLoggedIn={isLoggedIn}
              dashboardHref={dashboardHref}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Compromissos */}
      <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--background)] p-7 sm:p-8">
        <p className="text-sm font-semibold text-[var(--foreground)]">
          Quando houver planos pagos
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Ainda não fixamos preço porque ainda estamos ajustando o produto com
          quem usa de verdade. Em vez de um número inventado, aqui estão os
          compromissos que valem desde já.
        </p>

        <ul className="mt-7 flex-1 space-y-5">
          {COMMITMENTS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--primary)]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {item.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
