"use client";

import {
  RotinaActionRow,
  RotinaOtherTasks,
  type RotinaActionHandlers,
  type RotinaOtherTask,
} from "@/components/rotina/RotinaActionRow";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import type { ActionProductBlock } from "@/lib/rotina/view-summary";

/**
 * Opções de venda do mesmo produto na mesma tarefa: o produto aparece uma vez
 * (foto e título) e as opções (Clássico, Premium…) vêm logo abaixo, uma em
 * cima da outra, cada uma com o tipo em destaque e as próprias ações. Assim dá
 * para ver as duas juntas e trabalhar nelas de uma vez.
 */
export function RotinaProductBlock({
  block,
  handlers,
  timeZone,
  otherTasks = [],
  onOpenTask,
}: {
  block: ActionProductBlock;
  handlers: RotinaActionHandlers;
  timeZone: string;
  /** Tarefas das opções deste produto em outros grupos ("também em"). */
  otherTasks?: readonly RotinaOtherTask[];
  onOpenTask?: (rule: RotinaRuleKey) => void;
}) {
  const { lead } = block;
  const listing = lead.listing;
  return (
    <li className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_1px_2px_rgba(15,18,31,0.04)]">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 sm:px-4">
        <a
          href={listing.permalink}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          aria-hidden
          className="shrink-0"
        >
          <RotinaThumb src={listing.imageUrl} size={48} className="size-11 sm:size-12" />
        </a>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]" title={listing.title}>
            {listing.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
            <span className="font-medium text-[var(--foreground)]">
              {block.actions.length} opções de venda
            </span>
            {listing.saleOption ? ` · ${listing.saleOption.optionsLabel}` : ""}
            {listing.sku ? ` · ${listing.sku}` : ""}
          </p>
        </div>
      </div>
      <ul className="space-y-2 bg-[var(--muted)]/25 p-2 sm:p-2.5">
        {block.actions.map((action) => (
          <RotinaActionRow
            key={action.id}
            action={action}
            handlers={handlers}
            timeZone={timeZone}
            nested
          />
        ))}
      </ul>
      {otherTasks.length > 0 ? (
        <RotinaOtherTasks
          tasks={otherTasks}
          onOpenTask={onOpenTask}
          className="border-t border-[var(--border)] px-3 py-2 sm:px-4"
        />
      ) : null}
    </li>
  );
}
