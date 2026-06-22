"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildAdsMargem } from "@/lib/insights/ads-margem";
import type { AdsMargem } from "@/lib/insights/types";
import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";

function fmt(n: number | null, suffix = "%"): string {
  if (n === null) return "—";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
}

function fmtBrl(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AdsMargemCard() {
  const [rows, setRows] = useState<AdsMargem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/financial-evaluation")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: FinancialEvaluationRow[] }>;
      })
      .then((data) => {
        setRows(buildAdsMargem(data.items ?? []));
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Erro ao carregar dados");
        setLoading(false);
      });
  }, []);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[var(--primary)]">
            Ads que destroem margem
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Anúncios onde TACOS &gt; margem operacional — cada real em ads garante prejuízo.
          </p>
        </div>

        {loading && (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Carregando dados de lucratividade…
          </p>
        )}
        {error && (
          <p className="py-6 text-center text-sm text-red-600">{error}</p>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum anúncio com TACOS maior que a margem operacional.
          </p>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                  <th className="pb-2 pr-3 font-medium">Produto</th>
                  <th className="pb-2 pr-3 text-right font-medium">Margem base</th>
                  <th className="pb-2 pr-3 text-right font-medium">TACOS</th>
                  <th className="pb-2 pr-3 text-right font-medium">Margem após ads</th>
                  <th className="pb-2 text-right font-medium">Prejuízo/venda</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.mlItemId}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td
                      className="py-2 pr-3 max-w-[200px] truncate"
                      title={row.title}
                    >
                      {row.title}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span
                        className={cn(
                          "font-medium",
                          (row.baseMarginPercent ?? 0) < 0
                            ? "text-red-600"
                            : "text-green-700",
                        )}
                      >
                        {fmt(row.baseMarginPercent)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-orange-600">
                      {fmt(row.tacosPercent)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-red-600">
                      {fmt(row.marginAfterAdsPercent)}
                    </td>
                    <td className="py-2 text-right text-red-600">
                      {fmtBrl(row.marginAfterAdsValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
