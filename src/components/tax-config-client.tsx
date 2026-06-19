"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { Switch } from "@/components/ui/switch";
import { readApiError } from "@/lib/api-client-error";
import { BRAZILIAN_UF_OPTIONS } from "@/lib/tax-report/brazilian-ufs";
import type { IcmsRateRow, TaxCompanyConfig } from "@/lib/tax-report/types";
import type { CbsIbsVigenciaRow } from "@/lib/tax-report/calculators/cbs-ibs";
import { cn } from "@/lib/utils";

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
};

function companyToDraft(company: TaxCompanyConfig): CompanyDraft {
  return {
    originUf: company.originUf,
    pisRate: String(company.pisRatePercent),
    cofinsRate: String(company.cofinsRatePercent),
    excludeIcms: company.excludeIcmsFromPisCofinsBase,
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
            taxRegime: "LUCRO_REAL",
            originUf: draft.originUf.toUpperCase(),
            pisRatePercent: Number(draft.pisRate.replace(",", ".")),
            cofinsRatePercent: Number(draft.cofinsRate.replace(",", ".")),
            excludeIcmsFromPisCofinsBase: draft.excludeIcms,
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

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
          {error}
        </Card>
      ) : null}
      {message ? (
        <Card className="border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
          {message}
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 text-[var(--primary)]">
              <Building2 className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Empresa (Lucro Real)</h2>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Outros regimes serão habilitados em versões futuras.
              </p>
            </div>
          </div>
          {!editingCompany && company ? (
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
          {editingCompany ? (
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
                <label className="text-sm">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">
                    PIS %
                  </span>
                  <input
                    className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm shadow-sm"
                    value={draft.pisRate}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        pisRate: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">
                    COFINS %
                  </span>
                  <input
                    className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm shadow-sm"
                    value={draft.cofinsRate}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        cofinsRate: e.target.value,
                      }))
                    }
                  />
                </label>
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
                label="Excluir ICMS da base PIS/COFINS"
                value={company.excludeIcmsFromPisCofinsBase ? "Sim" : "Não"}
              />
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">ICMS interno + FCP por UF</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Valores iniciais devem ser validados com CONFAZ/RICMS. Alíquota total =
          base + FCP.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <th className="py-2 pr-3">UF</th>
                <th className="py-2 pr-3">Base %</th>
                <th className="py-2 pr-3">FCP %</th>
                <th className="py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {data?.icmsRates.map((row) => (
                <IcmsRateRowEditor
                  key={row.uf}
                  row={row}
                  saving={saving}
                  onSave={saveIcmsRow}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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

function IcmsRateRowEditor({
  row,
  saving,
  onSave,
}: {
  row: IcmsRateRow;
  saving: boolean;
  onSave: (row: IcmsRateRow) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(String(row.aliquotaBase * 100));
  const [fcp, setFcp] = useState(String(row.fcp * 100));

  useEffect(() => {
    if (!editing) {
      setBase(String(row.aliquotaBase * 100));
      setFcp(String(row.fcp * 100));
    }
  }, [row, editing]);

  if (!editing) {
    return (
      <tr className="border-b border-[var(--border)]">
        <td className="py-2 pr-3 font-medium">{row.uf}</td>
        <td className="py-2 pr-3 tabular-nums">
          {(row.aliquotaBase * 100).toFixed(2)}%
        </td>
        <td className="py-2 pr-3 tabular-nums">
          {(row.fcp * 100).toFixed(2)}%
        </td>
        <td className="py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5"
            disabled={saving}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/10">
      <td className="py-2 pr-3 font-medium">{row.uf}</td>
      <td className="py-2 pr-3">
        <input
          className="w-20 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          className="w-20 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
          value={fcp}
          onChange={(e) => setFcp(e.target.value)}
        />
      </td>
      <td className="py-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() =>
              void onSave({
                uf: row.uf,
                aliquotaBase: Number(base.replace(",", ".")) / 100,
                fcp: Number(fcp.replace(",", ".")) / 100,
              }).then(() => setEditing(false))
            }
          >
            Salvar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setBase(String(row.aliquotaBase * 100));
              setFcp(String(row.fcp * 100));
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      </td>
    </tr>
  );
}
