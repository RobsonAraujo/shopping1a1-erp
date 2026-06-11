"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportResponse = {
  pollStats: {
    todayCount: number;
    lastRunAt: string | null;
    lastRunSource: string | null;
    timezone: string;
  };
  items: Array<{
    mlItemId: string;
    titleSnapshot: string | null;
    skuSnapshot: string | null;
    imageUrlSnapshot: string | null;
    catalogStatus: string | null;
    catalogSellerPrice: number | null;
    catalogPriceToWin: number | null;
    catalogPolledAt: string | null;
  }>;
};

function statusBadgeClass(status: string | null) {
  if (status === "winning") {
    return "inline-flex rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white";
  }
  if (status === "losing") {
    return "inline-flex rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white";
  }
  if (status === "shared") {
    return "inline-flex rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white";
  }
  return "inline-flex rounded-md bg-[var(--muted)] px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)]";
}

function statusLabel(status: string | null) {
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  if (status === "shared") return "Compartilhando";
  return "Sem sinal";
}

function formatLastRun(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function CatalogCompetitionReportClient() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportResponse | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/catalog-competition");
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
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        changed?: number;
      };
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
  }, []);

  return (
    <div className="space-y-6">
      {data ? (
        <Card className="border-[var(--border)] bg-[var(--muted)]/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="text-sm">
              <span className="font-medium">Coletas hoje:</span>{" "}
              <span className="text-lg font-semibold">
                {data.pollStats.todayCount}
              </span>
              <span className="ml-3 text-[var(--muted-foreground)]">
                Última coleta às{" "}
                {formatLastRun(
                  data.pollStats.lastRunAt,
                  data.pollStats.timezone,
                )}
                {data.pollStats.lastRunSource
                  ? ` (${data.pollStats.lastRunSource === "cron" ? "cron" : "manual"})`
                  : ""}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void collectSnapshot()}
              disabled={refreshing}
            >
              <RefreshCw className="mr-1.5 size-4" />
              {refreshing ? "Atualizando..." : "Coletar snapshot agora"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
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
      )}

      {error ? (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="pt-6 text-sm text-red-900">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo anúncios</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Carregando...
            </p>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Sem dados de catálogo ainda. Clique em &quot;Coletar snapshot
              agora&quot; ou aguarde a próxima coleta automática.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
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
                            <div className="max-w-[400px] truncate text-xs text-[var(--muted-foreground)]">
                              {row.titleSnapshot ?? "Sem título sincronizado"}
                            </div>
                            <div className="font-mono text-[11px] text-[var(--muted-foreground)]">
                              {row.mlItemId}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={statusBadgeClass(row.catalogStatus)}>
                          {statusLabel(row.catalogStatus)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
