"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readApiError } from "@/lib/api-client-error";
import type { IcmsRateRow, TaxCompanyConfig } from "@/lib/tax-report/types";
import type { CbsIbsVigenciaRow } from "@/lib/tax-report/calculators/cbs-ibs";

type TaxConfigResponse = {
  company: TaxCompanyConfig;
  icmsRates: IcmsRateRow[];
  cbsIbs: CbsIbsVigenciaRow[];
};

export function TaxConfigClient() {
  const [data, setData] = useState<TaxConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [originUf, setOriginUf] = useState("SP");
  const [pisRate, setPisRate] = useState("1.65");
  const [cofinsRate, setCofinsRate] = useState("7.6");
  const [excludeIcms, setExcludeIcms] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tax-config");
      if (!res.ok) throw new Error(await readApiError(res, "tax_config_load"));
      const json = (await res.json()) as TaxConfigResponse;
      setData(json);
      setOriginUf(json.company.originUf);
      setPisRate(String(json.company.pisRatePercent));
      setCofinsRate(String(json.company.cofinsRatePercent));
      setExcludeIcms(json.company.excludeIcmsFromPisCofinsBase);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
            originUf: originUf.toUpperCase(),
            pisRatePercent: Number(pisRate.replace(",", ".")),
            cofinsRatePercent: Number(cofinsRate.replace(",", ".")),
            excludeIcmsFromPisCofinsBase: excludeIcms,
          },
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "tax_config_save"));
      setData((await res.json()) as TaxConfigResponse);
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

      <Card className="border-sky-200 bg-sky-50/60 p-4 text-sm text-sky-950">
        <p className="font-medium">CNPJ.ws (verificação de contribuinte ICMS)</p>
        <p className="mt-1 text-xs leading-relaxed">
          Integração implementada, porém <strong>desligada por padrão</strong>{" "}
          (serviço pago). Sem{" "}
          <code className="text-[11px]">CNPJ_WS_API_KEY</code> +{" "}
          <code className="text-[11px]">CONTRIBUTOR_PROVIDER=cnpj_ws</code>, PJ
          sem <code className="text-[11px]">taxpayer_type</code> no ML é tratado
          como não-contribuinte (DIFAL conservador).
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Empresa (Lucro Real)</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Outros regimes serão habilitados em versões futuras.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted-foreground)]">
              UF origem
            </span>
            <input
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm uppercase"
              value={originUf}
              maxLength={2}
              onChange={(e) => setOriginUf(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted-foreground)]">
              PIS %
            </span>
            <input
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              value={pisRate}
              onChange={(e) => setPisRate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted-foreground)]">
              COFINS %
            </span>
            <input
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              value={cofinsRate}
              onChange={(e) => setCofinsRate(e.target.value)}
            />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={excludeIcms}
              onChange={(e) => setExcludeIcms(e.target.checked)}
            />
            Excluir ICMS da base PIS/COFINS (RE 574.706)
          </label>
        </div>
        <Button
          type="button"
          className="mt-4"
          disabled={saving}
          onClick={() => void saveCompany()}
        >
          Salvar empresa
        </Button>
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
  const [base, setBase] = useState(String(row.aliquotaBase * 100));
  const [fcp, setFcp] = useState(String(row.fcp * 100));

  return (
    <tr className="border-b border-[var(--border)]">
      <td className="py-2 pr-3 font-medium">{row.uf}</td>
      <td className="py-2 pr-3">
        <input
          className="w-20 rounded border border-[var(--border)] px-2 py-1 text-sm"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          className="w-20 rounded border border-[var(--border)] px-2 py-1 text-sm"
          value={fcp}
          onChange={(e) => setFcp(e.target.value)}
        />
      </td>
      <td className="py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() =>
            void onSave({
              uf: row.uf,
              aliquotaBase: Number(base.replace(",", ".")) / 100,
              fcp: Number(fcp.replace(",", ".")) / 100,
            })
          }
        >
          Salvar
        </Button>
      </td>
    </tr>
  );
}
