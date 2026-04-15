"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportResponse = {
  windowDays: 7 | 30;
  from: string;
  to: string;
  totals: { winning: number; losing: number; shared: number; unknown: number };
  items: Array<{
    mlItemId: string;
    titleSnapshot: string | null;
    skuSnapshot: string | null;
    imageUrlSnapshot: string | null;
    totals: {
      winning: number;
      losing: number;
      shared: number;
      unknown: number;
    };
    timeline: Array<{
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

function statusCellClass(status: "winning" | "losing" | "shared") {
  if (status === "winning") {
    return "inline-flex rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white";
  }
  if (status === "losing") {
    return "inline-flex rounded-md bg-rose-600 px-2 py-1 font-semibold text-white";
  }
  return "inline-flex rounded-md bg-amber-500 px-2 py-1 font-semibold text-white";
}

export function CatalogCompetitionReportClient() {
  const [windowKey, setWindowKey] = useState<"7d" | "30d">("7d");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportResponse | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/catalog-competition?window=${windowKey}`,
      );
      const json = (await res.json()) as ReportResponse | { error?: string };
      if (!res.ok) {
        setError(
          (json as { error?: string }).error ?? "Falha ao carregar relatório.",
        );
        return;
      }
      setData(json as ReportResponse);
    } catch {
      setError("Falha de rede ao carregar relatório.");
    } finally {
      setLoading(false);
    }
  }

  async function collectSnapshot() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/ml/catalog-competition/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Falha ao coletar snapshot.");
        return;
      }
      await loadReport();
    } catch {
      setError("Falha de rede ao coletar snapshot.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  const ranking = useMemo(() => {
    if (!data) return [];
    return [...data.items].sort((a, b) => {
      const scoreA = a.totals.losing * 10 + a.totals.shared * 3 - a.totals.winning;
      const scoreB = b.totals.losing * 10 + b.totals.shared * 3 - b.totals.winning;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.timeline.length - a.timeline.length;
    });
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={windowKey === "7d" ? "default" : "outline"}
          size="sm"
          onClick={() => setWindowKey("7d")}
          disabled={loading}
        >
          Últimos 7 dias
        </Button>
        <Button
          variant={windowKey === "30d" ? "default" : "outline"}
          size="sm"
          onClick={() => setWindowKey("30d")}
          disabled={loading}
        >
          Últimos 30 dias
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void collectSnapshot()}
          disabled={refreshing}
        >
          <RefreshCw className="mr-1.5 size-4" />
          {refreshing ? "Atualizando..." : "Coletar snapshot agora"}
        </Button>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="pt-6 text-sm text-red-900">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ganhando</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="inline-flex rounded-md bg-emerald-600 px-2.5 py-1 text-2xl font-semibold text-white">
                {fmtMinutes(data.totals.winning)}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Perdendo</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="inline-flex rounded-md bg-rose-600 px-2.5 py-1 text-2xl font-semibold text-white">
                {fmtMinutes(data.totals.losing)}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Compartilhando</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="inline-flex rounded-md bg-amber-500 px-2.5 py-1 text-2xl font-semibold text-white">
                {fmtMinutes(data.totals.shared)}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sem sinal</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {fmtMinutes(data.totals.unknown)}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo anúncios </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Carregando...
            </p>
          ) : ranking.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Sem dados de catálogo ainda. Clique em &quot;Coletar snapshot
              agora&quot;.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Ganhando</th>
                    <th className="py-2 pr-3">Perdendo</th>
                    <th className="py-2 pr-3">Compartilhando</th>
                    <th className="py-2 pr-3">Mudanças</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => {
                    return (
                    <tr
                      key={row.mlItemId}
                      className="border-b border-[var(--border)]"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/dashboard/catalog-report/${row.mlItemId}`}
                          className="group flex items-center gap-2.5 rounded-md px-1 py-0.5 hover:bg-[var(--muted)]/40"
                        >
                          <span className="relative inline-flex size-10 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
                            {row.imageUrlSnapshot ? (
                              <Image
                                src={row.imageUrlSnapshot}
                                alt=""
                                fill
                                sizes="40px"
                                className="object-contain"
                              />
                            ) : null}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--primary)] group-hover:underline">
                              {row.skuSnapshot ?? "Sem SKU"}
                            </div>
                            <div className="truncate max-w-[400px] text-xs text-[var(--muted-foreground)]">
                              {row.titleSnapshot ?? "Sem título sincronizado"}
                            </div>
                            <div className="font-mono text-[11px] text-[var(--muted-foreground)]">
                              {row.mlItemId}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={statusCellClass("winning")}>
                          {fmtMinutes(row.totals.winning)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={statusCellClass("losing")}>
                          {fmtMinutes(row.totals.losing)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={statusCellClass("shared")}>
                          {fmtMinutes(row.totals.shared)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{row.timeline.length}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
