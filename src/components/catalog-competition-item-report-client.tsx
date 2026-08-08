"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { reportsConfig } from "@/config/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";

type DetailResponse = {
  from: string;
  to: string;
  timezone: string;
  catalogPolledAt: string | null;
  pollIsStale: boolean;
  item: {
    mlItemId: string;
    titleSnapshot: string | null;
    skuSnapshot: string | null;
    imageUrlSnapshot: string | null;
    catalogStatus: string | null;
    catalogSellerPrice: number | null;
    catalogPriceToWin: number | null;
  };
  totals: { winning: number; losing: number; shared: number; unknown: number };
  days: Array<{
    dayKey: string;
    label: string;
    unitsSold: number;
    entries: Array<{
      from: string;
      to: string;
      status: string;
      statusLabel: string;
      minutes: number;
      sellerPrice: number | null;
      priceToWin: number | null;
      sellerPriceLabel: string | null;
      priceToWinLabel: string | null;
      unitsSold: number;
      source: "event" | "snapshot";
    }>;
  }>;
};

function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function statusClass(status: string | null): string {
  if (status === "winning") {
    return "inline-flex rounded-md bg-emerald-600 px-2 py-0.5 font-semibold text-white";
  }
  if (status === "losing") {
    return "inline-flex rounded-md bg-rose-600 px-2 py-0.5 font-semibold text-white";
  }
  if (status === "shared") {
    return "inline-flex rounded-md bg-amber-500 px-2 py-0.5 font-semibold text-white";
  }
  return "inline-flex rounded-md bg-[var(--muted)] px-2 py-0.5 font-semibold text-[var(--muted-foreground)]";
}

function segmentClass(status: string): string {
  if (status === "winning") return "bg-emerald-500";
  if (status === "losing") return "bg-rose-500";
  if (status === "shared") return "bg-amber-400";
  return "bg-slate-400";
}

function statusLabel(status: string | null) {
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  if (status === "shared") return "Compartilhando";
  return "Sem sinal";
}

function isoDateInput(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: reportsConfig.catalogCompetitionTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatUnitsSold(units: number): string {
  if (units === 0) return "0 vendas";
  if (units === 1) return "1 venda";
  return `${units} vendas`;
}

function priceTooltip(entry: DetailResponse["days"][number]["entries"][number]): string {
  const parts: string[] = [];
  parts.push(formatUnitsSold(entry.unitsSold));
  if (entry.sellerPriceLabel) parts.push(`meu preço ${entry.sellerPriceLabel}`);
  if (entry.priceToWinLabel) parts.push(`para ganhar ${entry.priceToWinLabel}`);
  return ` — ${parts.join(" · ")}`;
}

function SalesChip({
  units,
  compact = false,
}: {
  units: number;
  compact?: boolean;
}) {
  const chipClass = compact
    ? "inline-flex items-center gap-1 rounded-md bg-[var(--background)] px-2 py-0.5 text-xs ring-1 ring-[var(--border)]"
    : "inline-flex items-center gap-1.5 rounded-md bg-[var(--background)] px-2.5 py-1 text-xs ring-1 ring-[var(--border)]";

  return (
    <span className={chipClass}>
      <span className="text-[var(--muted-foreground)]">Vendas</span>
      <span
        className={`font-semibold tabular-nums ${
          units > 0 ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
        }`}
      >
        {formatUnitsSold(units)}
      </span>
    </span>
  );
}

function PriceTags({
  sellerPriceLabel,
  priceToWinLabel,
  compact = false,
}: {
  sellerPriceLabel: string | null;
  priceToWinLabel: string | null;
  compact?: boolean;
}) {
  if (!sellerPriceLabel && !priceToWinLabel) return null;

  const chipClass = compact
    ? "inline-flex items-center gap-1 rounded-md bg-[var(--background)] px-2 py-0.5 text-xs ring-1 ring-[var(--border)]"
    : "inline-flex items-center gap-1.5 rounded-md bg-[var(--background)] px-2.5 py-1 text-xs ring-1 ring-[var(--border)]";

  return (
    <div className="flex flex-wrap gap-2">
      {sellerPriceLabel ? (
        <span className={chipClass}>
          <span className="text-[var(--muted-foreground)]">Meu preço</span>
          <span className="font-semibold tabular-nums text-[var(--foreground)]">
            {sellerPriceLabel}
          </span>
        </span>
      ) : null}
      {priceToWinLabel ? (
        <span className={chipClass}>
          <span className="text-[var(--muted-foreground)]">Para ganhar</span>
          <span className="font-semibold tabular-nums text-[var(--primary)]">
            {priceToWinLabel}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function TimelineEntryRow({
  entry,
}: {
  entry: DetailResponse["days"][number]["entries"][number];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={statusClass(entry.status)}>{entry.statusLabel}</span>
        <span className="text-sm text-[var(--muted-foreground)]">
          das{" "}
          <span className="font-medium tabular-nums text-[var(--foreground)]">
            {entry.from}
          </span>{" "}
          às{" "}
          <span className="font-medium tabular-nums text-[var(--foreground)]">
            {entry.to}
          </span>
          {entry.minutes > 0 ? (
            <span className="ml-1.5 text-xs">({fmtMinutes(entry.minutes)})</span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <SalesChip units={entry.unitsSold} />
        <PriceTags
          sellerPriceLabel={entry.sellerPriceLabel}
          priceToWinLabel={entry.priceToWinLabel}
        />
      </div>
    </div>
  );
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CatalogCompetitionItemReportClient({ itemId }: { itemId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [rangePreset, setRangePreset] = useState<"custom" | 7 | 15 | 30>(7);
  const [fromDate, setFromDate] = useState(() =>
    isoDateInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)),
  );
  const [toDate, setToDate] = useState(() => isoDateInput(new Date()));

  async function loadDetail(range?: { fromDate: string; toDate: string }) {
    setLoading(true);
    setError(null);
    try {
      const effectiveFromDate = range?.fromDate ?? fromDate;
      const effectiveToDate = range?.toDate ?? toDate;
      const q = new URLSearchParams({
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        tz: reportsConfig.catalogCompetitionTimezone,
      });
      const res = await fetch(
        `/api/reports/catalog-competition/items/${encodeURIComponent(itemId)}?${q.toString()}`,
      );
      const json = (await res.json()) as DetailResponse | { error?: string };
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Falha ao carregar detalhe.");
        return;
      }
      setData(json as DetailResponse);
    } catch {
      setError("Falha de rede ao carregar detalhe.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  function applyPreset(days: 7 | 15 | 30) {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    const nextFromDate = isoDateInput(from);
    const nextToDate = isoDateInput(to);
    setRangePreset(days);
    setFromDate(nextFromDate);
    setToDate(nextToDate);
    void loadDetail({ fromDate: nextFromDate, toDate: nextToDate });
  }

  const totalMinutes = useMemo(() => {
    if (!data) return 0;
    return (
      data.totals.winning + data.totals.losing + data.totals.shared + data.totals.unknown
    );
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--muted-foreground)]">
            Período
          </label>
          <DateRangePicker
            fromYmd={fromDate}
            toYmd={toDate}
            disabled={loading}
            onChange={(from, to) => {
              setRangePreset("custom");
              setFromDate(from);
              setToDate(to);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={rangePreset === 7 ? "default" : "outline"}
            size="sm"
            onClick={() => applyPreset(7)}
            disabled={loading}
          >
            Últimos 7 dias
          </Button>
          <Button
            variant={rangePreset === 15 ? "default" : "outline"}
            size="sm"
            onClick={() => applyPreset(15)}
            disabled={loading}
          >
            Últimos 15 dias
          </Button>
          <Button
            variant={rangePreset === 30 ? "default" : "outline"}
            size="sm"
            onClick={() => applyPreset(30)}
            disabled={loading}
          >
            Últimos 30 dias
          </Button>
        </div>
        <Button size="sm" onClick={() => void loadDetail()} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar período"}
        </Button>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="pt-6 text-sm text-red-900">{error}</CardContent>
        </Card>
      ) : null}

      {data ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex size-14 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
                {data.item.imageUrlSnapshot ? (
                  <Image
                    src={data.item.imageUrlSnapshot}
                    alt={data.item.titleSnapshot ?? ""}
                    fill
                    sizes="56px"
                    className="object-contain"
                  />
                ) : null}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-base font-semibold">
                    {data.item.skuSnapshot ?? "Sem SKU"}
                  </div>
                  <span className={statusClass(data.item.catalogStatus)}>
                    {statusLabel(data.item.catalogStatus)}
                  </span>
                </div>
                <div className="truncate text-sm text-[var(--muted-foreground)]">
                  {data.item.titleSnapshot ?? "Sem título sincronizado"}
                </div>
                <div className="font-mono text-xs text-[var(--muted-foreground)]">
                  {data.item.mlItemId}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--muted-foreground)]">
              <span>
                Fuso: {data.timezone} · Total observado: {fmtMinutes(totalMinutes)}
                {data.pollIsStale ? " · coleta atrasada (>30 min)" : ""}
              </span>
              {data.item.catalogSellerPrice !== null ||
              data.item.catalogPriceToWin !== null ? (
                <PriceTags
                  compact
                  sellerPriceLabel={
                    data.item.catalogSellerPrice !== null
                      ? formatMoney(data.item.catalogSellerPrice)
                      : null
                  }
                  priceToWinLabel={
                    data.item.catalogPriceToWin !== null
                      ? formatMoney(data.item.catalogPriceToWin)
                      : null
                  }
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {data && data.days.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
              Nenhum período com status observado no intervalo selecionado.
              {data.item.catalogStatus ? (
                <>
                  {" "}
                  Status atual:{" "}
                  <span className={statusClass(data.item.catalogStatus)}>
                    {statusLabel(data.item.catalogStatus)}
                  </span>
                  .
                </>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {data?.days.map((day) => (
          <Card key={day.dayKey}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base capitalize">{day.label}</CardTitle>
              <span className="text-sm text-[var(--muted-foreground)]">
                Total do dia:{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    day.unitsSold > 0
                      ? "text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {formatUnitsSold(day.unitsSold)}
                </span>
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              {day.entries.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Sem eventos.</p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-md border border-[var(--border)]">
                    <div className="flex h-6 w-full">
                      {day.entries.map((entry, idx) => {
                        const dayTotal = day.entries.reduce(
                          (sum, part) => sum + part.minutes,
                          0,
                        );
                        const widthPct =
                          dayTotal > 0 ? (entry.minutes / dayTotal) * 100 : 0;
                        return (
                          <div
                            key={`${day.dayKey}-bar-${idx}`}
                            className={segmentClass(entry.status)}
                            style={{ width: `${widthPct}%` }}
                            title={`${entry.statusLabel}: ${entry.from} - ${entry.to} (${fmtMinutes(
                              entry.minutes,
                            )})${priceTooltip(entry)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {day.entries.map((entry, idx) => (
                      <TimelineEntryRow key={`${day.dayKey}-${idx}`} entry={entry} />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
