import Image from "next/image";
import { Check, Clock3, Package } from "lucide-react";
import {
  RULE_ACCENT_CLASS,
  RULE_THEME_LABEL,
  RULE_VISUALS,
  STATUS_PILL_CLASS,
  ruleIconClass,
  themeTextClass,
} from "@/components/rotina/rule-visuals";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import { cn } from "@/lib/utils";

/**
 * Ilustração estática da Central de anúncios para a página de campanha: as
 * tarefas do dia com as cores e ícones reais das regras (`rule-visuals.ts`).
 * Não é interativa; os produtos são os mesmos das outras demos.
 */
const TASKS: {
  rule: RotinaRuleKey;
  task: string;
  product: string;
  image: string | null;
  detail: string;
  done?: boolean;
}[] = [
  {
    rule: "catalog_raise_price",
    task: "Subir preço no catálogo",
    product: "Fone Bluetooth TWS ANC",
    image: "/marketing/demo-fone.png",
    detail:
      "Concorrência a partir de R$ 159,90 e você a R$ 149,90: dá para subir sem perder o 1º lugar.",
  },
  {
    rule: "catalog_losing",
    task: "Brigar no catálogo",
    product: "Capa MagSafe iPhone 14",
    image: "/marketing/demo-capa.png",
    detail:
      "O vencedor está a R$ 47,90. Com a sua margem mínima, o seu piso é R$ 46,40.",
  },
  {
    rule: "promo_expiring",
    task: "Renovar promoção",
    product: "Cabo USB-C 2m nylon",
    image: "/marketing/demo-cabo.png",
    detail: "A promoção termina amanhã e trouxe 38% das vendas do mês.",
    done: true,
  },
  {
    rule: "no_recent_sales",
    task: "Sem venda recente",
    product: "Suporte veicular magnético",
    image: null,
    detail: "Nenhuma venda em 30 dias, com 14 unidades paradas no estoque.",
  },
];

const DONE_COUNT = 5;
const TOTAL_COUNT = 12;

export function DemoCentralAnuncios() {
  const progress = Math.round((DONE_COUNT / TOTAL_COUNT) * 100);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] text-left shadow-[0_1px_2px_rgba(15,18,31,0.04),0_24px_48px_-32px_rgba(27,45,111,0.35)]"
      aria-label="Exemplo da Central de anúncios"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Central de anúncios · hoje
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--muted)]">
              <span
                className="block h-full rounded-full bg-emerald-500"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {DONE_COUNT} de {TOTAL_COUNT} tratadas
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted-foreground)]">
          Dados de exemplo
        </span>
      </div>

      <ul className="space-y-3 p-3 sm:p-4" aria-hidden>
        {TASKS.map((t) => {
          const visual = RULE_VISUALS[t.rule];
          const Icon = visual.icon;
          const pill = visual.pill ? STATUS_PILL_CLASS[visual.tone] : null;
          return (
            <li
              key={t.rule}
              className={cn(
                "rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm sm:p-4",
                RULE_ACCENT_CLASS[visual.tone],
                t.done && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
                    ruleIconClass(t.rule),
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <p className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">
                  {t.task}
                </p>
                <span
                  className={cn(
                    "ml-auto hidden shrink-0 text-[11px] font-semibold uppercase tracking-wide sm:inline",
                    themeTextClass(visual.theme),
                  )}
                >
                  {RULE_THEME_LABEL[visual.theme]}
                </span>
              </div>

              <div className="mt-3 flex items-start gap-3">
                {t.image ? (
                  <Image
                    src={t.image}
                    alt=""
                    width={44}
                    height={44}
                    className="size-11 shrink-0 rounded-lg border border-[var(--border)] bg-white object-contain"
                  />
                ) : (
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]">
                    <Package className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {t.product}
                    </p>
                    {pill && visual.pill ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          pill.wrap,
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", pill.dot)} />
                        {visual.pill}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)] sm:text-[13px]">
                    {t.detail}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                {t.done ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Check className="size-3.5" />
                    Feito
                  </span>
                ) : (
                  <>
                    <span className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted-foreground)]">
                      <Clock3 className="size-3.5" />
                      Adiar
                    </span>
                    <span className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary-foreground)]">
                      <Check className="size-3.5" />
                      Feito
                    </span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
