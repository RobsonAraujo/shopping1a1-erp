"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Eye,
  History,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RotinaThumb } from "@/components/rotina/RotinaThumb";
import { SegmentTag } from "@/components/rotina/SegmentTag";
import {
  formatClock,
  formatShortDate,
  formatUnitsRate,
} from "@/lib/rotina/format";
import { ROTINA_RULES } from "@/lib/rotina/rule-registry";
import { isoIsToday } from "@/lib/rotina/time";
import type { RotinaActionView, RotinaInfoItem, RotinaView } from "@/lib/rotina/view";
import { cn } from "@/lib/utils";

const UNDO_CLASS =
  "shrink-0 cursor-pointer rounded text-xs font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

type Section = { key: string; count: number; node: ReactNode };

function Panel({
  title,
  icon: Icon,
  sections,
}: {
  title: string;
  icon: LucideIcon;
  sections: Section[];
}) {
  const visible = sections.filter((section) => section.count > 0);
  if (visible.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]/70">
      <h2 className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        <Icon className="size-3.5 opacity-70" aria-hidden />
        {title}
      </h2>
      <div className="divide-y divide-[var(--border)]">
        {visible.map((section) => (
          <div key={section.key}>{section.node}</div>
        ))}
      </div>
    </section>
  );
}

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
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/30 focus-visible:bg-[var(--muted)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="min-w-0 flex-1 font-medium text-[var(--foreground)]/80">{title}</span>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-semibold tabular-nums">
          {count}
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-3 pl-10 text-xs text-[var(--muted-foreground)]">
        {hint ? <p className="leading-relaxed">{hint}</p> : null}
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

/** Uma linha das listas: anúncio em cima, o que aconteceu com ele embaixo. */
function Row({
  imageUrl,
  href,
  title,
  aside,
  children,
}: {
  imageUrl: string | null;
  href: string;
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <RotinaThumb src={imageUrl} size={32} className="mt-0.5 size-8 rounded-md" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex min-w-0 flex-1">
            <ItemLink href={href} title={title} />
          </span>
          {aside}
        </div>
        {children ? <div className="mt-0.5 leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

/** "às 10h32" hoje, "em 08/11" antes. */
function whenLabel(iso: string, timeZone: string): string {
  return isoIsToday(iso, new Date(), timeZone)
    ? `às ${formatClock(iso, timeZone)}`
    : `em ${formatShortDate(iso, timeZone)}`;
}

/** Feito: quando, e quem vai conferir se resolveu de verdade. */
function doneDetail(action: RotinaActionView, timeZone: string): string {
  const definition = ROTINA_RULES[action.rule];
  const when = action.decidedAt ? ` ${whenLabel(action.decidedAt, timeZone)}` : "";
  if (action.kind === "event") return `${definition.taskLabel} · ciente${when}`;
  const check =
    action.rule === "catalog_raise_price"
      ? "estimativa: confira se continua ganhando na próxima leitura do catálogo"
      : definition.source === "catalog"
        ? "confere na próxima leitura do catálogo"
        : "confere no próximo Atualizar";
  return `${definition.taskLabel} · feito${when} · ${check}`;
}

const OUTCOME_TONE = {
  ok: { className: "text-emerald-800", icon: Check },
  warn: { className: "text-amber-800", icon: AlertTriangle },
  bad: { className: "text-rose-700", icon: XCircle },
} as const;

/** Resolvido: o problema que havia → o que o dado de agora mostra. */
function ResolvedDetail({ item }: { item: RotinaInfoItem }) {
  const tone = OUTCOME_TONE[item.outcomeTone ?? "ok"];
  const Icon = tone.icon;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span>{item.note}</span>
      {item.outcome ? (
        <>
          <ArrowRight className="size-3 shrink-0 opacity-60" aria-hidden />
          <span className="sr-only">agora:</span>
          <span className={cn("inline-flex items-center gap-1 font-medium", tone.className)}>
            <Icon className="size-3 shrink-0" aria-hidden />
            {item.outcome}
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * O que não é tarefa de hoje mas precisa estar à mão: o histórico do dia
 * (feitos, adiados, ignorados, resolvidos) com "desfazer", e o que vale ficar de
 * olho (dados faltando, riscos, vínculos). Tudo cinza e recolhido — informa sem
 * alarmar.
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

  const actionLine = (action: RotinaActionView, detail: string) => (
    <Row
      key={action.id}
      imageUrl={action.listing.imageUrl}
      href={action.listing.permalink}
      title={action.listing.title}
      aside={
        <>
          <SegmentTag segment={action.segment} className="hidden sm:inline-flex" />
          <button
            type="button"
            className={UNDO_CLASS}
            disabled={busy}
            onClick={() => onUndo(action)}
          >
            Desfazer
          </button>
        </>
      }
    >
      {detail}
    </Row>
  );

  const itemLine = (item: RotinaInfoItem, key: string, detail?: ReactNode) => (
    <Row
      key={key}
      imageUrl={item.imageUrl}
      href={item.permalink}
      title={item.title}
    >
      {detail}
    </Row>
  );

  const history: Section[] = [
    {
      key: "done",
      count: doneToday.length,
      node: (
        <InfoSection title="Feitos hoje" count={doneToday.length}>
          {doneToday.map((action) => actionLine(action, doneDetail(action, timeZone)))}
        </InfoSection>
      ),
    },
    {
      key: "snoozed",
      count: snoozed.length,
      node: (
        <InfoSection title="Adiados" count={snoozed.length}>
          {snoozed.map((action) =>
            actionLine(
              action,
              [
                ROTINA_RULES[action.rule].taskLabel,
                action.snoozedUntil
                  ? `volta em ${formatShortDate(action.snoozedUntil, timeZone)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          )}
        </InfoSection>
      ),
    },
    {
      key: "dismissed",
      count: dismissed.length,
      node: (
        <InfoSection
          title="Ignorados"
          count={dismissed.length}
          hint="Esta regra não aparece mais para estes anúncios até você desfazer."
        >
          {dismissed.map((action) =>
            actionLine(
              action,
              [
                ROTINA_RULES[action.rule].settingsLabel,
                action.decidedAt ? `ignorado ${whenLabel(action.decidedAt, timeZone)}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          )}
        </InfoSection>
      ),
    },
    {
      key: "resolved",
      count: info.resolvedToday.length,
      node: (
        <InfoSection title="Resolvidos hoje" count={info.resolvedToday.length}>
          {info.resolvedToday.map((item, index) =>
            itemLine(item, `${item.mlItemId}-${index}`, <ResolvedDetail item={item} />),
          )}
        </InfoSection>
      ),
    },
  ];

  const watch: Section[] = [
    {
      key: "missing",
      count: info.dataMissing.length,
      node: (
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
          {info.dataMissing.map((item) => itemLine(item, item.mlItemId, item.note))}
        </InfoSection>
      ),
    },
    {
      key: "eligible",
      count: info.catalogEligible.length,
      node: (
        <InfoSection
          title="Em risco de virar catálogo"
          count={info.catalogEligible.length}
          hint="O ML marcou estes anúncios próprios como elegíveis: ele pode criar um anúncio de catálogo a partir deles."
        >
          {info.catalogEligible.map((item) => itemLine(item, item.mlItemId))}
        </InfoSection>
      ),
    },
    {
      key: "linked",
      count: info.linkedCatalog.length,
      node: (
        <InfoSection title="Próprios que já têm catálogo ligado" count={info.linkedCatalog.length}>
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
      ),
    },
  ];

  const hasHistory = history.some((section) => section.count > 0);
  const hasWatch = watch.some((section) => section.count > 0);
  if (!hasHistory && !hasWatch) return null;

  return (
    <div className={cn("grid items-start gap-3", hasHistory && hasWatch && "lg:grid-cols-2")}>
      <Panel title="Histórico de hoje" icon={History} sections={history} />
      <Panel title="Para ficar de olho" icon={Eye} sections={watch} />
    </div>
  );
}
