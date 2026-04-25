"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { reportsConfig } from "@/config/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DetailResponse = {
  from: string;
  to: string;
  timezone: string;
  item: {
    mlItemId: string;
    titleSnapshot: string | null;
    skuSnapshot: string | null;
    imageUrlSnapshot: string | null;
  };
  totals: { winning: number; losing: number; shared: number; unknown: number };
  days: Array<{
    dayKey: string;
    label: string;
    entries: Array<{
      from: string;
      to: string;
      status: string;
      minutes: number;
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

function statusClass(status: string): string {
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

function isoDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
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
          <label className="mb-1 block text-xs text-[var(--muted-foreground)]">De</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setRangePreset("custom");
              setFromDate(e.target.value);
            }}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Até</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setRangePreset("custom");
              setToDate(e.target.value);
            }}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
                    alt=""
                    fill
                    sizes="56px"
                    className="object-contain"
                  />
                ) : null}
              </span>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">
                  {data.item.skuSnapshot ?? "Sem SKU"}
                </div>
                <div className="truncate text-sm text-[var(--muted-foreground)]">
                  {data.item.titleSnapshot ?? "Sem título sincronizado"}
                </div>
                <div className="font-mono text-xs text-[var(--muted-foreground)]">
                  {data.item.mlItemId}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              Fuso: {data.timezone} · Total observado: {fmtMinutes(totalMinutes)}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {data?.days.map((day) => (
          <Card key={day.dayKey}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{day.label}</CardTitle>
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
                            title={`${entry.status}: ${entry.from} - ${entry.to} (${fmtMinutes(
                              entry.minutes,
                            )})`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  {day.entries.map((entry, idx) => (
                    <p key={`${day.dayKey}-${idx}`} className="text-sm">
                      <span className={statusClass(entry.status)}>
                        {entry.status === "winning"
                          ? "Ganhando"
                          : entry.status === "losing"
                            ? "Perdendo"
                            : entry.status === "shared"
                              ? "Compartilhando"
                              : "Sem sinal"}
                      </span>{" "}
                      das {entry.from} até {entry.to} ({fmtMinutes(entry.minutes)})
                    </p>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

