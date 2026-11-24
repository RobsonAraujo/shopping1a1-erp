"use client";

import { ChevronRight, Info } from "lucide-react";
import {
  RotinaActionRow,
  type RotinaActionHandlers,
  type RotinaOtherTask,
} from "@/components/rotina/RotinaActionRow";
import { RotinaProductBlock } from "@/components/rotina/RotinaProductBlock";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { groupActionsByProduct } from "@/lib/rotina/view-summary";
import { RULE_VISUALS, ruleIconClass } from "@/components/rotina/rule-visuals";
import { ROTINA_RULES, TACOS_RULES, type RotinaRuleKey } from "@/lib/rotina/rule-registry";
import type { RotinaActionView } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

const PREVIEW_THUMBS = 4;
const PREVIEW_NAMES = 2;

/**
 * "Kit Facas, Panela Inox e mais 3" — a tarefa e em quem ela cai. As opções
 * de venda do mesmo produto contam uma vez (não "Cabo, Cabo e mais 2").
 */
function previewNames(products: RotinaActionView[]): string {
  const names = products.slice(0, PREVIEW_NAMES).map((action) => action.listing.title);
  const rest = products.length - names.length;
  return rest > 0 ? `${names.join(", ")} e mais ${rest}` : names.join(", ");
}

function rotinaGroupId(rule: RotinaRuleKey): string {
  return `rotina-group-${rule}`;
}

/**
 * Nas tarefas que dependem do TACOS: a conta é sempre a dos últimos 7 dias do
 * Atualizar. Aviso discreto (cinza), não alerta.
 */
function TacosBasisNote({ lastRunLabel }: { lastRunLabel: string | null }) {
  return (
    <p className="mb-2.5 flex items-start gap-1.5 px-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
      <Info className="mt-0.5 size-3.5 shrink-0 opacity-60" aria-hidden />
      <span>
        Margem após ADS e TACOS dos últimos 7 dias
        {lastRunLabel ? `, da atualização de ${lastRunLabel}` : ""}. Para testar com o TACOS de
        hoje, use Simular.
      </span>
    </p>
  );
}

/**
 * Um grupo da lista do dia = uma tarefa ("Colocar promoção: X, Y, Z"). Começa
 * fechado: a pilha de grupos fechados é o resumo do que tem para hoje.
 */
export function RotinaTaskGroup({
  rule,
  actions,
  handlers,
  timeZone,
  open,
  onToggle,
  lastRunLabel = null,
  otherTasksOf,
  onOpenTask,
}: {
  rule: RotinaRuleKey;
  actions: RotinaActionView[];
  handlers: RotinaActionHandlers;
  timeZone: string;
  open: boolean;
  onToggle: () => void;
  /** "hoje às 09:12" — de quando são os números das tarefas (aviso do TACOS). */
  lastRunLabel?: string | null;
  /**
   * Opções de venda: tarefas das opções de um produto em **outros** grupos
   * (o atalho "Premium também em: …"). Ausente = sem atalho.
   */
  otherTasksOf?: (productKey: string, rule: RotinaRuleKey) => RotinaOtherTask[];
  /** Abre outro grupo e rola até ele. */
  onOpenTask?: (rule: RotinaRuleKey) => void;
}) {
  const definition = ROTINA_RULES[rule];
  const visual = RULE_VISUALS[rule];
  const Icon = visual.icon;
  const fresh = actions.filter((action) => action.isNew).length;
  const sectionId = rotinaGroupId(rule);
  const panelId = `${sectionId}-panel`;
  const blocks = groupActionsByProduct(actions);
  const products = blocks.map((block) => block.lead);
  const thumbs = products.slice(0, PREVIEW_THUMBS);
  const extraThumbs = products.length - thumbs.length;

  return (
    <section
      id={sectionId}
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-shadow",
        open ? "shadow-sm" : "hover:shadow-sm",
      )}
    >
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--muted)]/30 focus-visible:bg-[var(--muted)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:px-4"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              ruleIconClass(rule),
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[15px] font-semibold text-[var(--foreground)]">
                {definition.taskLabel}
                {visual.taskHint ? (
                  <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">
                    ({visual.taskHint})
                  </span>
                ) : null}
              </span>
              <span
                className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--foreground)]"
              >
                {actions.length}
              </span>
              {fresh > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                  <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                  {fresh} {fresh === 1 ? "novo hoje" : "novos hoje"}
                </span>
              ) : null}
            </span>
            {!open ? (
              <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted-foreground)]">
                {previewNames(products)}
              </span>
            ) : null}
          </span>
          {!open ? (
            <span className="hidden shrink-0 items-center sm:flex" aria-hidden>
              {thumbs.map((action, index) => (
                <RotinaThumb
                  key={action.id}
                  src={action.listing.imageUrl}
                  size={32}
                  className={cn(
                    "size-8 rounded-full border-2 border-[var(--card)]",
                    index > 0 && "-ml-2.5",
                  )}
                />
              ))}
              {extraThumbs > 0 ? (
                <span className="-ml-2.5 flex size-8 items-center justify-center rounded-full border-2 border-[var(--card)] bg-[var(--muted)] text-[10px] font-semibold tabular-nums text-[var(--muted-foreground)]">
                  +{extraThumbs}
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      </h3>
      {open ? (
        <div
          id={panelId}
          className="border-t border-[var(--border)] bg-[var(--muted)]/30 p-2 sm:p-3"
        >
          {TACOS_RULES.has(rule) ? <TacosBasisNote lastRunLabel={lastRunLabel} /> : null}
          <ul className="space-y-2.5">
            {blocks.map((block) =>
              block.actions.length > 1 ? (
                <RotinaProductBlock
                  key={`product:${block.key}`}
                  block={block}
                  handlers={handlers}
                  timeZone={timeZone}
                  otherTasks={otherTasksOf?.(block.key, rule) ?? []}
                  onOpenTask={onOpenTask}
                />
              ) : (
                <RotinaActionRow
                  key={block.lead.id}
                  action={block.lead}
                  handlers={handlers}
                  timeZone={timeZone}
                  otherTasks={
                    block.lead.listing.saleOption ? (otherTasksOf?.(block.key, rule) ?? []) : []
                  }
                  onOpenTask={onOpenTask}
                />
              ),
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
