"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import { UserFeedback } from "@/components/ui/user-feedback";
import { readApiError } from "@/lib/api-client-error";
import type { TaxCompanyConfig } from "@/lib/tax-report/types";

type TaxConfigResponse = {
  company: TaxCompanyConfig;
};

const TAX_REGIME_OPTIONS = [
  { value: "LUCRO_REAL", label: "Lucro Real" },
  { value: "SIMPLES", label: "Simples Nacional" },
];

const TAX_REGIME_LABEL: Record<string, string> = {
  LUCRO_REAL: "Lucro Real",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  SIMPLES: "Simples Nacional",
};

export function CompanyRegimeClient() {
  const [company, setCompany] = useState<TaxCompanyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [draftRegime, setDraftRegime] =
    useState<TaxCompanyConfig["taxRegime"]>("LUCRO_REAL");
  const [draftAliquota, setDraftAliquota] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tax-config");
      if (!res.ok) throw new Error(await readApiError(res, "tax_config_load"));
      const json = (await res.json()) as TaxConfigResponse;
      setCompany(json.company);
      setDraftRegime(json.company.taxRegime);
      setDraftAliquota(
        json.company.simplesAliquotaEfetivaPercent != null
          ? String(json.company.simplesAliquotaEfetivaPercent)
          : "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, unknown> = { taxRegime: draftRegime };
      if (draftRegime === "SIMPLES") {
        const aliquota = Number(draftAliquota.replace(",", "."));
        if (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100) {
          setError("Informe a alíquota efetiva do Simples Nacional (0 a 100).");
          setSaving(false);
          return;
        }
        body.simplesAliquotaEfetivaPercent = aliquota;
      }
      const res = await fetch("/api/tax-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: body }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "tax_config_save"));
      const json = (await res.json()) as TaxConfigResponse;
      setCompany(json.company);
      setDraftRegime(json.company.taxRegime);
      setMessage("Regime tributário salvo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>;
  }

  const regimeChanged = company !== null && draftRegime !== company.taxRegime;

  return (
    <div className="space-y-6">
      {error ? (
        <UserFeedback>{error}</UserFeedback>
      ) : null}
      {message ? (
        <UserFeedback tone="success" title="Salvo">
          {message}
        </UserFeedback>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 text-[var(--primary)]">
            <Building2 className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Regime tributário</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Define como impostos são calculados em Produtos, Lucratividade e
              nos relatórios fiscais.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              id="company-regime"
              label="Regime tributário"
              value={draftRegime}
              onValueChange={(value) =>
                setDraftRegime(value as TaxCompanyConfig["taxRegime"])
              }
              options={TAX_REGIME_OPTIONS}
              triggerClassName="w-full"
            />
            {draftRegime === "SIMPLES" ? (
              <FormInput
                id="company-regime-simples-aliquota"
                label="Alíquota efetiva do Simples (%)"
                value={draftAliquota}
                onChange={(e) => setDraftAliquota(e.target.value)}
                placeholder="Ex.: 6,5"
              />
            ) : null}
          </div>

          {regimeChanged ? (
            <Card className="border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-900">
              Você está trocando o regime de{" "}
              <strong>{TAX_REGIME_LABEL[company!.taxRegime]}</strong> para{" "}
              <strong>{TAX_REGIME_LABEL[draftRegime]}</strong>. Produtos
              cadastrados não serão alterados nem apagados — campos fiscais
              específicos de Lucro Real deixam de aparecer no cadastro de
              produtos enquanto o regime for Simples Nacional (os valores já
              salvos ficam preservados e voltam a aparecer se o regime mudar de
              novo). O Relatório Tributário Mensal não está disponível para
              Simples Nacional nesta versão.
            </Card>
          ) : null}

          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
