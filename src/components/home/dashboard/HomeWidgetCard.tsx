"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { CATEGORY_BADGE_CLASS } from "@/lib/ui/tone";
import type { HomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import { cn } from "@/lib/utils";

/**
 * Casca compartilhada dos widgets da Home. Concentra o que todo widget tem
 * igual — título, badge de ícone, link pra tela de detalhe, skeleton e erro —
 * pra cada widget novo ser só o corpo.
 *
 * O erro fica DENTRO do card de propósito: uma slice que falhou degrada o
 * widget dela e o resto da Home segue funcionando.
 */
export function HomeWidgetCard({
  definition,
  children,
  pending = false,
  error = null,
  count,
  actions,
  className,
  bodyClassName,
}: {
  definition: HomeWidgetDefinition;
  children?: ReactNode;
  pending?: boolean;
  error?: string | null;
  /** Contador ao lado do título (nº de itens pedindo atenção). */
  count?: number;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const Icon = definition.icon;

  return (
    <section
      aria-label={definition.title}
      aria-busy={pending || undefined}
      className={cn(
        "flex h-full flex-col rounded-3xl bg-[var(--card)] p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            CATEGORY_BADGE_CLASS[definition.tone],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-medium text-[var(--foreground)]">
          {definition.title}
        </h2>
        {count !== undefined && count > 0 ? (
          <span className="shrink-0 text-sm tabular-nums text-[var(--muted-foreground)]">
            {count.toLocaleString("pt-BR")}
          </span>
        ) : null}
        {actions}
        {definition.href ? (
          <Link
            href={definition.href}
            className="group shrink-0 rounded-full p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label={`Abrir ${definition.title}`}
          >
            <ArrowUpRight
              className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>

      <div className={cn("mt-4 flex-1", bodyClassName)}>
        {pending ? (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
        ) : error ? (
          <UserFeedback tone="warning">{error}</UserFeedback>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * Estado vazio de widget. Nunca "Sem dados": explica a situação e, quando faz
 * sentido, oferece a ação que resolve.
 */
export function HomeWidgetEmpty({
  title,
  description,
  actionLabel,
  actionHref,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  tone?: "neutral" | "ok";
}) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-1.5 py-1">
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
        {tone === "ok" ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
        ) : null}
        {title}
      </p>
      {description ? (
        <p className="text-sm leading-snug text-[var(--muted-foreground)]">
          {description}
        </p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-1 text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** Valor grande + legenda — o miolo dos widgets de KPI. */
export function HomeWidgetMetric({
  value,
  label,
  hint,
  valueClassName,
}: {
  value: string;
  label: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-3xl font-bold tabular-nums tracking-tight text-[var(--foreground)]",
          valueClassName,
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{label}</p>
      {hint ? (
        <p className="mt-1.5 text-xs leading-snug text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
