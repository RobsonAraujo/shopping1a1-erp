"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-input";
import type { IcmsRateRow } from "@/lib/tax-report/types";
import type { IcmsRateRowEditorProps } from "./types";

export function IcmsRatesMobile({
  rows,
  saving,
  onSave,
}: {
  rows: IcmsRateRow[];
  saving: boolean;
  onSave: (row: IcmsRateRow) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <IcmsRateCardEditor key={row.uf} row={row} saving={saving} onSave={onSave} />
      ))}
    </div>
  );
}

function IcmsRateCardEditor({ row, saving, onSave }: IcmsRateRowEditorProps) {
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
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{row.uf}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)] tabular-nums">
            Base {(row.aliquotaBase * 100).toFixed(2)}% · FCP {(row.fcp * 100).toFixed(2)}%
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 gap-1.5"
          disabled={saving}
          onClick={startEditing}
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 px-3 py-3">
      <p className="text-sm font-semibold">{row.uf}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <FormInput label="Base %" value={base} onChange={(e) => setBase(e.target.value)} />
        <FormInput label="FCP %" value={fcp} onChange={(e) => setFcp(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  );
}
