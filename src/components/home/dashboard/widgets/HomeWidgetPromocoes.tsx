"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import {
  DashboardSection,
  DashboardSectionClear,
} from "@/components/home/DashboardHomeSection";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { useInView } from "@/hooks/use-in-view";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import type {
  PromotionSummaryPayload,
  PromotionSummaryRow,
} from "@/lib/home/promotion-summary-data";

function daysUntilLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `${days} dias`;
}

function PromotionRow({ row }: { row: PromotionSummaryRow }) {
  const urgent = row.daysUntilEnd !== null && row.daysUntilEnd <= 1;

  return (
    <li>
      <a
        href={row.permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--muted)]/40 sm:px-5"
        title={`${row.title} · abrir no Mercado Livre`}
      >
        <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)] sm:size-12">
          {row.imageUrl ? (
            <Image
              src={row.imageUrl}
              alt=""
              width={48}
              height={48}
              className="size-full object-contain"
              sizes="48px"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <ImageOff
                className="size-4 text-[var(--muted-foreground)]/70"
                aria-hidden
              />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--foreground)]">
            {row.sku ?? "Sem SKU"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
            {formatFinancialMoney(row.salePrice)}
            {row.promotionName ? ` · ${row.promotionName}` : ""}
          </span>
        </span>
        <span
          className={
            urgent
              ? "shrink-0 text-sm font-semibold tabular-nums text-rose-700"
              : "shrink-0 text-sm font-medium tabular-nums text-amber-800"
          }
        >
          {daysUntilLabel(row.daysUntilEnd)}
        </span>
      </a>
    </li>
  );
}

function PromotionList({ rows }: { rows: PromotionSummaryRow[] }) {
  return (
    <>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--card)]">
        {rows.slice(0, 8).map((row) => (
          <PromotionRow key={row.mlItemId} row={row} />
        ))}
      </ul>
      {rows.length > 8 ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          + {rows.length - 8} promoção(ões)
        </p>
      ) : null}
    </>
  );
}

/**
 * Promoções terminando. É o widget mais lento da Home (varre todo anúncio
 * ativo com 1-2 chamadas ao ML, `maxDuration = 300` na rota), então tem
 * request próprio, disparado só quando o card entra na viewport.
 *
 * Como no PMA, a seção nunca desaparece — vazia vira "tudo ok", falha vira
 * erro dentro da seção, e avisos de dado parcial aparecem ao lado.
 */
export function HomeWidgetPromocoes() {
  const [setRef, inView] = useInView<HTMLDivElement>();
  const [data, setData] = useState<PromotionSummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inView) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/dashboard/summary/promotions", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json()) as
          | PromotionSummaryPayload
          | { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(
            (json as { error?: string }).error ?? "Falha ao carregar promoções.",
          );
          return;
        }
        setData(json as PromotionSummaryPayload);
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        setError("Falha de rede ao carregar promoções.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [inView]);

  const expiringSoon = data?.expiringSoon ?? [];
  const pending = data === null && error === null;
  const count =
    !pending && !error && expiringSoon.length > 0
      ? expiringSoon.length
      : undefined;

  return (
    <div ref={setRef}>
      <DashboardSection title="Promoções terminando" count={count} tone="warning">
        {data?.warnings?.length ? (
          <div className="mb-3">
            <UserFeedback tone="warning" title="Alguns dados não chegaram">
              <ul className="list-disc space-y-1 pl-4">
                {data.warnings.slice(0, 5).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
                {data.warnings.length > 5 ? (
                  <li>… e mais {data.warnings.length - 5} aviso(s).</li>
                ) : null}
              </ul>
            </UserFeedback>
          </div>
        ) : null}

        {pending ? (
          <Skeleton className="h-24 rounded-3xl" />
        ) : error ? (
          <UserFeedback>{error}</UserFeedback>
        ) : expiringSoon.length > 0 ? (
          <PromotionList rows={expiringSoon} />
        ) : (
          <DashboardSectionClear message="Nenhuma promoção vencendo nos próximos dias." />
        )}
      </DashboardSection>
    </div>
  );
}
