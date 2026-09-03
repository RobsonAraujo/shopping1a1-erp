"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ImageOff, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UserFeedback } from "@/components/ui/user-feedback";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import type {
  PromotionSummaryPayload,
  PromotionSummaryRow,
} from "@/lib/home/promotion-summary-data";

function formatPromotionEndDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntilLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "termina hoje";
  if (days === 1) return "termina amanhã";
  return `termina em ${days} dias`;
}

function PromotionRow({
  row,
  showPromotionMeta,
}: {
  row: PromotionSummaryRow;
  showPromotionMeta: boolean;
}) {
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:bg-[var(--muted)]/20">
      <div className="flex items-start gap-3">
        <Link
          href={`/dashboard/items/${row.mlItemId}`}
          className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
          aria-label={`Abrir detalhes: ${row.title}`}
        >
          {row.imageUrl ? (
            <Image
              src={row.imageUrl}
              alt={row.title}
              width={80}
              height={80}
              className="size-14 object-contain sm:size-16"
              sizes="64px"
            />
          ) : (
            <div className="flex size-14 items-center justify-center sm:size-16">
              <ImageOff
                className="size-6 text-[var(--muted-foreground)]/70"
                aria-hidden
              />
            </div>
          )}
        </Link>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/dashboard/items/${row.mlItemId}`}
                className="block truncate text-sm font-semibold text-[var(--primary)] underline-offset-2 hover:underline sm:text-base"
                title={row.title}
              >
                {row.sku ?? "Sem SKU"}
              </Link>
              <p className="truncate text-xs text-[var(--muted-foreground)] sm:text-sm">
                {row.title}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={row.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--primary)] hover:underline"
              >
                ML
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)] sm:text-sm">
            <span>
              Preço:{" "}
              <strong className="font-medium text-[var(--foreground)]">
                {formatFinancialMoney(row.salePrice)}
              </strong>
            </span>
            {row.regularPrice != null && row.regularPrice > row.salePrice ? (
              <span className="line-through">
                {formatFinancialMoney(row.regularPrice)}
              </span>
            ) : null}
            <span className="font-mono text-[11px] sm:text-xs">
              {row.mlItemId}
            </span>
          </div>

          {showPromotionMeta ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge
                variant={
                  row.daysUntilEnd !== null && row.daysUntilEnd <= 1
                    ? "destructive"
                    : "warning"
                }
                className="text-xs"
              >
                {daysUntilLabel(row.daysUntilEnd)}
              </Badge>
              <span className="text-xs text-[var(--muted-foreground)]">
                até {formatPromotionEndDate(row.promotionEndsAt)}
              </span>
              {row.promotionName ? (
                <span className="text-xs text-[var(--muted-foreground)]">
                  · {row.promotionName}
                </span>
              ) : row.promotionType ? (
                <span className="text-xs text-[var(--muted-foreground)]">
                  · {row.promotionType}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function DashboardSummaryClient() {
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
            "Falha ao carregar resumo de promoções.",
        );
        return;
      }
      setData(json as PromotionSummaryPayload);
    } catch {
      setError("Falha de rede ao carregar resumo de promoções.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const expiringSoon = data?.expiringSoon ?? [];
  const withoutPromotion = data?.withoutPromotion ?? [];
  const totalCount = expiringSoon.length + withoutPromotion.length;

  return (
    <div className="space-y-3">
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

      {loading && !data ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            Carregando promoções…
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-[var(--border)] border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <Tag className="size-4 shrink-0" aria-hidden />
              Anúncios próprios ativos
            </div>
            <Badge variant="warning" className="px-2.5 py-0.5 text-xs">
              {totalCount} {totalCount === 1 ? "anúncio" : "anúncios"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5 pt-0 pb-4">
            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-6 py-12 text-center">
                <p className="max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
                  {(data?.totalActiveItems ?? 0) === 0
                    ? "Nenhum anúncio próprio ativo no momento."
                    : "Todos os anúncios ativos já têm promoção e nenhuma vence nos próximos dias."}
                </p>
              </div>
            ) : (
              <>
                {expiringSoon.length > 0 ? (
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                      Termina em até {data?.expiringSoonDays ?? 3} dias
                      <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">
                        ({expiringSoon.length})
                      </span>
                    </h3>
                    <ul className="space-y-2">
                      {expiringSoon.map((row) => (
                        <PromotionRow
                          key={row.mlItemId}
                          row={row}
                          showPromotionMeta
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}

                {withoutPromotion.length > 0 ? (
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                      Sem promoção
                      <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">
                        ({withoutPromotion.length})
                      </span>
                    </h3>
                    <ul className="space-y-2">
                      {withoutPromotion.map((row) => (
                        <PromotionRow
                          key={row.mlItemId}
                          row={row}
                          showPromotionMeta={false}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
