"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import { SortableTh } from "@/components/ui/sortable-th";
import type { IcmsRatesTableViewProps, IcmsRateRowEditorProps } from "./types";

export function IcmsRatesDesktop({ rows, saving, onSave, sort, onSortChange }: IcmsRatesTableViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
            <SortableTh label="UF" sortKey="uf" sort={sort} onSortChange={onSortChange} align="left" />
            <SortableTh
              label="Base %"
              sortKey="aliquotaBase"
              sort={sort}
              onSortChange={onSortChange}
              align="left"
            />
            <SortableTh label="FCP %" sortKey="fcp" sort={sort} onSortChange={onSortChange} align="left" />
            <th className="py-2">Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <IcmsRateRowEditor key={row.uf} row={row} saving={saving} onSave={onSave} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IcmsRateRowEditor({ row, saving, onSave }: IcmsRateRowEditorProps) {
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(String(row.aliquotaBase * 100));
  const [fcp, setFcp] = useState(String(row.fcp * 100));

  function startEditing() {
    setBase(String(row.aliquotaBase * 100));
    setFcp(String(row.fcp * 100));
    setEditing(true);
  }

  if (!editing) {
    return (
      <tr className="border-b border-[var(--border)]">
        <td className="py-2 pr-3 font-medium">{row.uf}</td>
        <td className="py-2 pr-3 tabular-nums">{(row.aliquotaBase * 100).toFixed(2)}%</td>
        <td className="py-2 pr-3 tabular-nums">{(row.fcp * 100).toFixed(2)}%</td>
        <td className="py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5"
            disabled={saving}
            onClick={startEditing}
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
        <FormInput
          className="w-20"
          inputClassName="h-8 sm:h-8 px-2 py-1"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
      </td>
      <td className="py-2 pr-3">
        <FormInput
          className="w-20"
          inputClassName="h-8 sm:h-8 px-2 py-1"
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
