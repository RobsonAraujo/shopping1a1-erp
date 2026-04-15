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
  if (status === "winning") return "text-emerald-700";
  if (status === "losing") return "text-rose-700";
  if (status === "shared") return "text-amber-700";
  return "text-[var(--muted-foreground)]";
}

function isoDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CatalogCompetitionItemReportClient({ itemId }: { itemId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [fromDate, setFromDate] = useState(() =>
    isoDateInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  );
  const [toDate, setToDate] = useState(() => isoDateInput(new Date()));

  async function loadDetail() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        from: new Date(`${fromDate}T00:00:00`).toISOString(),
        to: new Date(`${toDate}T23:59:59`).toISOString(),
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
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Até</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
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
                day.entries.map((entry, idx) => (
                  <p key={`${day.dayKey}-${idx}`} className="text-sm">
                    <span className={`font-semibold ${statusClass(entry.status)}`}>
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
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

