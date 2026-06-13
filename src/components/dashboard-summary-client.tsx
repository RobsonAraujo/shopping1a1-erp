"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  ImageOff,
  Percent,
  RefreshCw,
  Tag,
} from "lucide-react";
import { AttentionPanelCollapseToggle } from "@/components/attention-panel-collapse-toggle";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/item-list-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePersistedOpen } from "@/hooks/use-persisted-open";
import { formatFinancialMoney } from "@/lib/financial-margin";
import { filterByItemListSearch } from "@/lib/item-list-search";
import type {
  PromotionSummaryPayload,
  PromotionSummaryRow,
} from "@/lib/promotion-summary-data";
import { cn } from "@/lib/utils";

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

type PromotionSectionProps = {
  title: string;
  description: string;
  rows: PromotionSummaryRow[];
  collapseStorageKey: string;
  variant: "neutral" | "warning";
  showPromotionMeta?: boolean;
  searchQuery: string;
};

function PromotionRow({
  row,
  showPromotionMeta,
}: {
  row: PromotionSummaryRow;
  showPromotionMeta?: boolean;
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
              alt=""
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
            <span className="font-mono text-[11px] sm:text-xs">{row.mlItemId}</span>
          </div>

          {showPromotionMeta ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {row.daysUntilEnd !== null ? (
                <Badge
                  variant={row.daysUntilEnd <= 1 ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {daysUntilLabel(row.daysUntilEnd)}
                </Badge>
              ) : null}
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

function PromotionSection({
  title,
  description,
  rows,
  collapseStorageKey,
  variant,
  showPromotionMeta,
  searchQuery,
}: PromotionSectionProps) {
  const { open, toggle } = usePersistedOpen(collapseStorageKey, true);
  const filteredRows = useMemo(
    () =>
      filterByItemListSearch(rows, searchQuery, (row) => ({
        sku: row.sku,
        title: row.title,
        mlItemId: row.mlItemId,
      })),
    [rows, searchQuery],
  );

  const ringClass =
    variant === "warning"
      ? "border-amber-200/90 ring-amber-100/70"
      : "border-[var(--border)] ring-[var(--border)]/40";
  const iconBgClass =
    variant === "warning"
      ? "bg-amber-100 text-amber-900"
      : "bg-[var(--muted)] text-[var(--primary)]";

  return (
    <Card
      className={cn(
        "overflow-hidden bg-gradient-to-br from-white via-white to-[var(--card)] shadow-md ring-1",
        ringClass,
      )}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                iconBgClass,
              )}
            >
              {variant === "warning" ? (
                <Tag className="size-5" aria-hidden />
              ) : (
                <Percent className="size-5" aria-hidden />
              )}
            </span>
            <CardTitle className="text-lg text-[var(--primary)]">
              {title}
            </CardTitle>
          </div>
          <CardDescription className="max-w-2xl text-sm leading-relaxed">
            {description}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            {rows.length} {rows.length === 1 ? "anúncio" : "anúncios"}
          </Badge>
          <AttentionPanelCollapseToggle
            open={open}
            onToggle={toggle}
            panelLabel={title}
          />
        </div>
      </CardHeader>

      {open ? (
        <CardContent className="pb-4">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-6 py-12 text-center">
              <p className="max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
                {rows.length === 0
                  ? "Nenhum anúncio nesta situação no momento."
                  : itemListSearchEmptyMessage(searchQuery)}
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filteredRows.map((row) => (
                <PromotionRow
                  key={row.mlItemId}
                  row={row}
                  showPromotionMeta={showPromotionMeta}
                />
              ))}
            </ul>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function DashboardSummaryClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PromotionSummaryPayload | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Anúncios próprios ativos no Mercado Livre.
          {data?.fetchedAt ? (
            <>
              {" "}
              Atualizado em{" "}
              {new Date(data.fetchedAt).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
              .
            </>
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={() => void loadData()}
        >
          <RefreshCw
            className={cn("size-4", loading ? "animate-spin" : "")}
            aria-hidden
          />
          Atualizar
        </Button>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-6 text-sm text-red-900">{error}</CardContent>
        </Card>
      ) : null}

      {data?.warnings?.length ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="pt-6 text-sm text-amber-950">
            <p className="font-medium">Alguns dados não puderam ser carregados:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {data.warnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
              {data.warnings.length > 5 ? (
                <li>… e mais {data.warnings.length - 5} aviso(s).</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <ItemListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Buscar por SKU, título ou ID do anúncio…"
      />

      {loading && !data ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            Carregando promoções…
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <PromotionSection
            title="Sem promoção"
            description="Anúncios próprios ativos vendendo pelo preço regular, sem desconto vigente."
            rows={data?.withoutPromotion ?? []}
            collapseStorageKey="dashboard-summary-without-promotion"
            variant="neutral"
            searchQuery={searchQuery}
          />

          <PromotionSection
            title={`Promoção termina em até ${data?.expiringSoonDays ?? 3} dias`}
            description="Anúncios com desconto ativo que encerra em breve — útil para renovar antes de perder visibilidade."
            rows={data?.expiringSoon ?? []}
            collapseStorageKey="dashboard-summary-expiring-promotion"
            variant="warning"
            showPromotionMeta
            searchQuery={searchQuery}
          />
        </div>
      )}
    </div>
  );
}
