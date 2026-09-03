"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { FormSelect } from "@/components/ui/form-select";
import { Switch } from "@/components/ui/switch";
import { UserFeedback } from "@/components/ui/user-feedback";
import { readApiError } from "@/lib/api/api-client-error";
import { BRAZILIAN_UF_OPTIONS } from "@/lib/tax-report/brazilian-ufs";
import type { IcmsRateRow, TaxCompanyConfig } from "@/lib/tax-report/types";
import type { CbsIbsVigenciaRow } from "@/lib/tax-report/calculators/cbs-ibs";
import { cn } from "@/lib/utils";
import { IcmsRatesTable } from "./icms-rates-table";

type TaxConfigResponse = {
  company: TaxCompanyConfig;
  icmsRates: IcmsRateRow[];
  cbsIbs: CbsIbsVigenciaRow[];
};

type CompanyDraft = {
  originUf: string;
  pisRate: string;
  cofinsRate: string;
  excludeIcms: boolean;
  considerIcmsStRecuperavel: boolean;
};

function companyToDraft(company: TaxCompanyConfig): CompanyDraft {
  return {
    originUf: company.originUf,
    pisRate: String(company.pisRatePercent),
    cofinsRate: String(company.cofinsRatePercent),
    excludeIcms: company.excludeIcmsFromPisCofinsBase,
    considerIcmsStRecuperavel: company.considerIcmsStRecuperavel,
  };
}

function CompanySettingView({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 px-3 py-2.5", className)}>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function TaxConfigClient() {
  const [data, setData] = useState<TaxConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanyDraft>({
    originUf: "SP",
    pisRate: "1.65",
    cofinsRate: "7.6",
    excludeIcms: true,
    considerIcmsStRecuperavel: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tax-config");
      if (!res.ok) throw new Error(await readApiError(res, "tax_config_load"));
      const json = (await res.json()) as TaxConfigResponse;
      setData(json);
      setDraft(companyToDraft(json.company));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEditCompany = () => {
    if (data) setDraft(companyToDraft(data.company));
    setEditingCompany(true);
  };

  const cancelEditCompany = () => {
    if (data) setDraft(companyToDraft(data.company));
    setEditingCompany(false);
  };

  const saveCompany = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/tax-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: {
            originUf: draft.originUf.toUpperCase(),
            pisRatePercent: Number(draft.pisRate.replace(",", ".")),
            cofinsRatePercent: Number(draft.cofinsRate.replace(",", ".")),
            excludeIcmsFromPisCofinsBase: draft.excludeIcms,
            considerIcmsStRecuperavel: draft.considerIcmsStRecuperavel,
          },
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "tax_config_save"));
      const json = (await res.json()) as TaxConfigResponse;
      setData(json);
      setDraft(companyToDraft(json.company));
      setEditingCompany(false);
      setMessage("Configurações salvas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const saveIcmsRow = async (row: IcmsRateRow) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tax-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icmsRate: row }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "icms_save"));
      setData((await res.json()) as TaxConfigResponse);
      setMessage(`Alíquota ${row.uf} atualizada.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar ICMS");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>;
  }

  const company = data?.company;
  const isSimples = company?.taxRegime === "SIMPLES";

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
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 text-[var(--primary)]">
              <Building2 className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Parâmetros Lucro Real</h2>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                UF de origem, PIS/COFINS e créditos usados na apuração do
                Lucro Real.
              </p>
            </div>
          </div>
          {!isSimples && !editingCompany && company ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={startEditCompany}
            >
              <Pencil className="size-4" aria-hidden />
              Editar
            </Button>
          ) : null}
        </div>

        <div className="px-4 py-4 sm:px-5">
          {isSimples ? (
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              A empresa está no regime Simples Nacional — esses parâmetros
              (usados na apuração do Lucro Real) não se aplicam e ficam
              ocultos. Os valores continuam salvos e voltam a aparecer aqui se
              o regime mudar de volta para Lucro Real. Configure a alíquota
              efetiva do Simples em{" "}
              <Link
                href="/dashboard/configuracoes/empresa"
                className="text-[var(--primary)] underline"
              >
                Configurações &gt; Empresa
              </Link>
              .
            </p>
          ) : editingCompany ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormSelect
                  id="tax-config-origin-uf"
                  label="UF origem"
                  value={draft.originUf}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, originUf: value }))
                  }
                  options={BRAZILIAN_UF_OPTIONS}
                  triggerClassName="w-full"
                />
                <FormInput
                  id="tax-config-pis-rate"
                  label="PIS %"
                  value={draft.pisRate}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      pisRate: e.target.value,
                    }))
                  }
                />
                <FormInput
                  id="tax-config-cofins-rate"
                  label="COFINS %"
                  value={draft.cofinsRate}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      cofinsRate: e.target.value,
                    }))
                  }
                />
                <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--muted-foreground)]">
                        Excluir ICMS da base PIS/COFINS
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
                        RE 574.706 (STF)
                      </p>
                    </div>
                    <Switch
                      checked={draft.excludeIcms}
                      onCheckedChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          excludeIcms: checked,
                        }))
                      }
                      aria-label="Excluir ICMS da base PIS/COFINS"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--muted-foreground)]">
                        ICMS-ST recuperável (venda interestadual)
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
                        Tema 201/STF, Convênio ICMS 142/2018
                      </p>
                    </div>
                    <Switch
                      checked={draft.considerIcmsStRecuperavel}
                      onCheckedChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          considerIcmsStRecuperavel: checked,
                        }))
                      }
                      aria-label="Considerar crédito de ICMS-ST recuperável em vendas interestaduais"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveCompany()}
                >
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={cancelEditCompany}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : company ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CompanySettingView label="UF origem" value={company.originUf} />
              <CompanySettingView
                label="PIS"
                value={`${company.pisRatePercent}%`}
              />
              <CompanySettingView
                label="COFINS"
                value={`${company.cofinsRatePercent}%`}
              />
              <CompanySettingView
                label="PIS + COFINS (produtos)"
                value={`${Number((company.pisRatePercent + company.cofinsRatePercent).toFixed(4))}%`}
              />
              <CompanySettingView
                label="Excluir ICMS da base PIS/COFINS"
                value={company.excludeIcmsFromPisCofinsBase ? "Sim" : "Não"}
              />
              <CompanySettingView
                label="ICMS-ST recuperável (interestadual)"
                value={company.considerIcmsStRecuperavel ? "Sim" : "Não"}
              />
            </div>
          ) : null}
        </div>
      </Card>

      {!isSimples ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">ICMS interno + FCP por UF</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Valores iniciais devem ser validados com CONFAZ/RICMS. Alíquota
            total = base + FCP.
          </p>
          <div className="mt-4">
            <IcmsRatesTable
              rows={data?.icmsRates ?? []}
              saving={saving}
              onSave={saveIcmsRow}
            />
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold">CBS / IBS (informativo)</h2>
        <ul className="mt-2 space-y-2 text-xs text-[var(--muted-foreground)]">
          {data?.cbsIbs.map((row) => (
            <li key={row.year}>
              {row.year}: CBS{" "}
              {row.cbsRate != null ? `${(row.cbsRate * 100).toFixed(2)}%` : "ref."}{" "}
              · IBS est.{" "}
              {row.ibsEstadualRate != null
                ? `${(row.ibsEstadualRate * 100).toFixed(2)}%`
                : "—"}{" "}
              · {row.notes}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
