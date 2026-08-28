"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Percent } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserFeedback } from "@/components/ui/user-feedback";
import { SimplesRbt12Panel } from "@/components/simples-nacional/simples-rbt12-panel";
import { SimplesDasComposicaoPanel } from "@/components/simples-nacional/simples-das-composicao-panel";
import { SimplesSimuladorPanel } from "@/components/simples-nacional/simples-simulador-panel";
import { readApiError } from "@/lib/api-client-error";
import { roundMoney } from "@/lib/financial-margin";
import type { Rbt12Result } from "@/lib/simples-nacional/types";

export function SimplesNacionalClient() {
  const [companyTaxRegime, setCompanyTaxRegime] = useState<string | null>(null);
  const [simplesAliquotaEfetivaPercent, setSimplesAliquotaEfetivaPercent] =
    useState<number | null>(null);
  const [rbt12, setRbt12] = useState<Rbt12Result | null>(null);
  const [loadingRbt12, setLoadingRbt12] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tax-config")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          json: {
            company?: {
              taxRegime?: string;
              simplesAliquotaEfetivaPercent?: number | null;
            };
          } | null,
        ) => {
          if (cancelled || !json?.company) return;
          setCompanyTaxRegime(json.company.taxRegime ?? null);
          setSimplesAliquotaEfetivaPercent(
            json.company.simplesAliquotaEfetivaPercent ?? null,
          );
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRbt12 = useCallback(
    async (cancelledRef: { current: boolean }, forceRefresh = false) => {
      setLoadingRbt12(true);
      setError(null);
      try {
        const res = await fetch(
          forceRefresh
            ? "/api/reports/simples-nacional/rbt12?refresh=1"
            : "/api/reports/simples-nacional/rbt12",
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "rbt12_load_failed"));
        }
        const data = (await res.json()) as Rbt12Result;
        if (!cancelledRef.current) setRbt12(data);
      } catch (e) {
        if (!cancelledRef.current) {
          setError(e instanceof Error ? e.message : "Erro ao carregar RBT12");
        }
      } finally {
        if (!cancelledRef.current) setLoadingRbt12(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (companyTaxRegime !== "SIMPLES") return;
    const cancelledRef = { current: false };
    void loadRbt12(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [companyTaxRegime, loadRbt12]);

  const refreshRbt12 = useCallback(() => {
    void loadRbt12({ current: false }, true);
  }, [loadRbt12]);

  if (companyTaxRegime && companyTaxRegime !== "SIMPLES") {
    return (
      <Card className="p-6 text-center">
        <Percent className="mx-auto size-8 text-[var(--muted-foreground)]" aria-hidden />
        <h2 className="mt-3 text-sm font-semibold">
          Página disponível apenas para empresas do Simples Nacional
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
          Esta empresa está configurada como Lucro Real. Acesse o{" "}
          <Link
            href="/dashboard/tributario"
            className="font-medium text-[var(--primary)] underline"
          >
            Relatório Tributário Mensal
          </Link>{" "}
          ou ajuste o regime em Configurações.
        </p>
      </Card>
    );
  }

  const lastMonth = rbt12?.months[rbt12.months.length - 1] ?? null;
  const aliquotaParaComposicao =
    simplesAliquotaEfetivaPercent ?? rbt12?.aliquotaEfetivaNominal ?? 0;
  const valorDasMes = lastMonth
    ? roundMoney(lastMonth.revenue * (aliquotaParaComposicao / 100))
    : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {simplesAliquotaEfetivaPercent == null ? (
          <UserFeedback tone="warning" title="Alíquota efetiva do DAS não configurada">
            Configure a alíquota efetiva do DAS em{" "}
            <Link
              href="/dashboard/configuracoes/empresa"
              className="font-medium underline"
            >
              Configurações → Empresa
            </Link>{" "}
            para ver os valores de composição do DAS e do simulador.
          </UserFeedback>
        ) : null}

        {error ? (
          <UserFeedback title="Não foi possível carregar o RBT12">{error}</UserFeedback>
        ) : null}

        <SimplesRbt12Panel
          result={rbt12}
          simplesAliquotaEfetivaPercent={simplesAliquotaEfetivaPercent}
          loading={loadingRbt12}
          onRefresh={refreshRbt12}
        />

        {rbt12 && lastMonth ? (
          <SimplesDasComposicaoPanel
            faixa={rbt12.faixa}
            valorDasMes={valorDasMes}
            year={lastMonth.year}
            month={lastMonth.month}
          />
        ) : null}

        <SimplesSimuladorPanel />
      </div>
    </TooltipProvider>
  );
}
