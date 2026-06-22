"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

type LoadState = "loading" | "ok" | "error";

export function AdsMargemCard() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AdsMargem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/financial-evaluation")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: FinancialEvaluationRow[] }>;
      })
      .then((data) => {
        setRows(buildAdsMargem(data.items ?? []));
        setState("ok");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Erro ao carregar dados");
        setState("error");
      });
  }, []);

  const badge =
    state === "loading"
      ? "carregando…"
      : state === "error"
        ? "erro"
        : rows.length > 0
          ? `${rows.length} anúncio${rows.length !== 1 ? "s" : ""}`
          : "tudo ok";

  const badgeVariant =
    state === "error"
      ? "destructive"
      : rows.length > 0
        ? "warning"
        : state === "ok"
          ? "success"
          : "secondary";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm",
        "border-l-4 border-l-purple-400",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--muted)]/30 sm:px-5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
          <Zap className="size-4" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-[var(--primary)]">
              Ads que destroem margem
            </span>
            <Badge variant={badgeVariant} className="px-1.5 py-0 text-[10px]">
              {badge}
            </Badge>
          </span>
          <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
            Anúncios onde TACOS supera a margem operacional — ads gerando prejuízo
          </span>
        </span>

        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
          {state === "loading" && (
            <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
              Carregando dados de lucratividade…
            </p>
          )}
          {state === "error" && (
            <p className="py-4 text-center text-sm text-red-600">{error}</p>
          )}
          {state === "ok" && rows.length === 0 && (
            <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
              Nenhum anúncio com TACOS maior que a margem operacional.
            </p>
          )}
          {state === "ok" && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 text-right font-medium">Margem base</th>
                    <th className="pb-2 pr-3 text-right font-medium">TACOS</th>
                    <th className="pb-2 pr-3 text-right font-medium">Margem após ads</th>
                    <th className="pb-2 text-right font-medium">Resultado/venda</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.mlItemId}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-2 pr-3 max-w-[200px] truncate" title={row.title}>
                        {row.title}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <span
                          className={cn(
                            "font-medium",
                            (row.baseMarginPercent ?? 0) < 0 ? "text-red-600" : "text-green-700",
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
        </div>
      )}
    </div>
  );
}
