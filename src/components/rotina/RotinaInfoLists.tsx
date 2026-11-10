"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Info } from "lucide-react";
import { formatShortDate, formatUnitsRate } from "@/lib/rotina/format";
import { ROTINA_RULES } from "@/lib/rotina/rule-registry";
import type { RotinaActionView, RotinaView } from "@/lib/rotina/view";

const UNDO_CLASS =
  "shrink-0 cursor-pointer text-xs font-medium text-[var(--primary)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50";

function InfoSection({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint?: ReactNode;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details className="group rounded-xl border border-[var(--border)] bg-[var(--card)]/60 px-4 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <Info className="size-3.5 shrink-0 opacity-60" aria-hidden />
        <span className="font-medium text-[var(--foreground)]/80">{title}</span>
        <span className="tabular-nums">({count})</span>
      </summary>
      <div className="mt-2 space-y-1.5 pb-1 pl-6 text-xs text-[var(--muted-foreground)]">
        {hint ? <p>{hint}</p> : null}
        {children}
      </div>
    </details>
  );
}

function ItemLink({ href, title }: { href: string; title: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="min-w-0 truncate font-medium text-[var(--foreground)] hover:underline"
      title={title}
    >
      {title}
    </a>
  );
}

/**
 * O que não é tarefa de hoje mas precisa estar à mão: dados faltando, riscos,
 * vínculos, e o histórico do dia (feitos, adiados, ignorados, resolvidos) com
 * "desfazer". Tudo cinza e recolhido — informa sem alarmar.
 */
export function RotinaInfoLists({
  info,
  actions,
  timeZone,
  busy,
  onUndo,
}: {
  info: RotinaView["info"];
  actions: RotinaActionView[];
  timeZone: string;
  busy: boolean;
  onUndo: (action: RotinaActionView) => void;
}) {
  const doneToday = actions.filter((action) => action.doneToday);
  const snoozed = actions.filter((action) => action.bucket === "snoozed");
  const dismissed = actions.filter((action) => action.bucket === "dismissed");

  const actionLine = (action: RotinaActionView, suffix?: string) => (
    <div key={action.id} className="flex items-center gap-3">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <ItemLink href={action.listing.permalink} title={action.listing.title} />
        <span className="shrink-0">
          · {ROTINA_RULES[action.rule].settingsLabel}
          {suffix ? ` · ${suffix}` : ""}
        </span>
      </span>
      <button
        type="button"
        className={UNDO_CLASS}
        disabled={busy}
        onClick={() => onUndo(action)}
      >
        Desfazer
      </button>
    </div>
  );

  return (
    <div className="space-y-2">
      <InfoSection
        title="Faltam dados para calcular margem e preço mínimo"
        count={info.dataMissing.length}
        hint={
          <>
            Sem custo ou alíquota a margem sairia inflada, então esses anúncios ficam
            fora das regras de margem.{" "}
            <Link
              href="/dashboard/produtos"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Completar em Meus produtos
            </Link>
          </>
        }
      >
        {info.dataMissing.map((item) => (
          <div key={item.mlItemId} className="flex items-center gap-1.5">
            <ItemLink href={item.permalink} title={item.title} />
            <span className="shrink-0">· {item.note}</span>
          </div>
        ))}
      </InfoSection>

      <InfoSection
        title="Em risco de virar catálogo"
        count={info.catalogEligible.length}
        hint="O ML marcou estes anúncios próprios como elegíveis: ele pode criar um anúncio de catálogo a partir deles."
      >
        {info.catalogEligible.map((item) => (
          <div key={item.mlItemId} className="flex items-center gap-1.5">
            <ItemLink href={item.permalink} title={item.title} />
          </div>
        ))}
      </InfoSection>

      <InfoSection
        title="Próprios que já têm catálogo ligado"
        count={info.linkedCatalog.length}
      >
        {info.linkedCatalog.map((pair) => (
          <div key={pair.catalog.mlItemId} className="flex flex-wrap items-center gap-x-1.5">
            <ItemLink href={pair.own.permalink} title={pair.own.title} />
            <span>
              ({formatUnitsRate(pair.own.unitsPerDay)}) → catálogo{" "}
              <a
                href={pair.catalog.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--foreground)] hover:underline"
              >
                {pair.catalog.mlItemId}
              </a>{" "}
              ({formatUnitsRate(pair.catalog.unitsPerDay)}
              {pair.catalog.listedAt
                ? `, desde ${formatShortDate(pair.catalog.listedAt, timeZone)}`
                : ""}
              )
            </span>
          </div>
        ))}
      </InfoSection>

      <InfoSection title="Feitos hoje" count={doneToday.length}>
        {doneToday.map((action) => actionLine(action))}
      </InfoSection>

      <InfoSection title="Adiados" count={snoozed.length}>
        {snoozed.map((action) =>
          actionLine(
            action,
            action.snoozedUntil
              ? `volta em ${formatShortDate(action.snoozedUntil, timeZone)}`
              : undefined,
          ),
        )}
      </InfoSection>

      <InfoSection
        title="Ignorados"
        count={dismissed.length}
        hint="Esta regra não aparece mais para estes anúncios até você desfazer."
      >
        {dismissed.map((action) => actionLine(action))}
      </InfoSection>

      <InfoSection title="Resolvidos hoje" count={info.resolvedToday.length}>
        {info.resolvedToday.map((item, index) => (
          <div key={`${item.mlItemId}-${index}`} className="flex items-center gap-1.5">
            <ItemLink href={item.permalink} title={item.title} />
            <span className="shrink-0">· {item.note}</span>
          </div>
        ))}
      </InfoSection>
    </div>
  );
}
