"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ImageOff } from "lucide-react";
import { DashboardPmaAlertPanel } from "@/components/home/DashboardPmaAlertPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import type { PmaAlertRow } from "@/lib/home/pma-alert-data";
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
      <Link
        href={`/dashboard/items/${row.mlItemId}`}
        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--muted)]/40 sm:px-5"
        title={row.title}
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
      </Link>
    </li>
  );
}

function AllClear() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-3xl bg-[var(--card)] px-4 py-5 sm:px-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="size-5" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--foreground)]">
          Tudo certo por aqui
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Nenhum anúncio abaixo do PMA e nenhuma promoção vencendo nos próximos
          dias.
        </p>
      </div>
    </div>
  );
}

function SectionClear({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-[var(--muted-foreground)]">
        {title}
      </h2>
      <div
        role="status"
        className="flex items-center gap-3 rounded-3xl bg-[var(--card)] px-4 py-4 sm:px-5"
      >
        <CheckCircle2
          className="size-5 shrink-0 text-emerald-600"
          aria-hidden
        />
        <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
      </div>
    </section>
  );
}

export function DashboardSummaryClient({
  pmaRows,
}: {
  pmaRows: PmaAlertRow[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PromotionSummaryPayload | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/summary/promotions", {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | PromotionSummaryPayload
        | { error?: string };
      if (!res.ok) {
        setError(
          (json as { error?: string }).error ??
            "Falha ao carregar promoções.",
        );
        return;
      }
      setData(json as PromotionSummaryPayload);
    } catch {
      setError("Falha de rede ao carregar promoções.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const expiringSoon = data?.expiringSoon ?? [];
  const pmaEmpty = pmaRows.length === 0;
  const promoReadyEmpty = !loading && !error && expiringSoon.length === 0;

  if (loading && !data) {
    return (
      <div className="space-y-8">
        {pmaEmpty ? null : <DashboardPmaAlertPanel rows={pmaRows} />}
        <Skeleton className="h-24 rounded-3xl" />
      </div>
    );
  }

  if (pmaEmpty && promoReadyEmpty) {
    return <AllClear />;
  }

  return (
    <div className="space-y-8">
      {pmaEmpty ? (
        <SectionClear
          title="Abaixo do PMA"
          message="Nenhum anúncio abaixo do preço mínimo autorizado."
        />
      ) : (
        <DashboardPmaAlertPanel rows={pmaRows} />
      )}

      {error ? <UserFeedback>{error}</UserFeedback> : null}

      {data?.warnings?.length ? (
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
      ) : null}

      {error ? null : expiringSoon.length > 0 ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-[var(--muted-foreground)]">
              Promoções terminando
            </h2>
            <span className="text-sm tabular-nums text-amber-800">
              {expiringSoon.length}
            </span>
          </div>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--card)]">
            {expiringSoon.slice(0, 8).map((row) => (
              <PromotionRow key={row.mlItemId} row={row} />
            ))}
          </ul>
          {expiringSoon.length > 8 ? (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              + {expiringSoon.length - 8} promoção(ões)
            </p>
          ) : null}
        </section>
      ) : (
        <SectionClear
          title="Promoções terminando"
          message="Nenhuma promoção vencendo nos próximos dias."
        />
      )}
    </div>
  );
}
