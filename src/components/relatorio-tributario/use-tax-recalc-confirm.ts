"use client";

import { useCallback, useState } from "react";
import type {
  TaxRecalcKind,
  TaxRecalcMonthPreview,
} from "@/components/relatorio-tributario/TaxRecalcConfirmDialog";
import { readApiError } from "@/lib/api/api-client-error";
import type { TaxRecalcPreview, TaxReportDreFollowUp } from "@/lib/tax-report/types";

type ConfirmState = {
  kind: TaxRecalcKind;
  months: TaxRecalcMonthPreview[];
  loading: boolean;
};

async function loadPreview(
  kind: TaxRecalcKind,
  year: number,
  month: number,
): Promise<Pick<TaxRecalcMonthPreview, "report" | "dre" | "error">> {
  try {
    if (kind === "refresh") {
      const res = await fetch("/api/dre/tax/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, dryRun: true }),
      });
      if (!res.ok) {
        return { report: null, dre: null, error: await readApiError(res, "dre_tax_refresh_failed") };
      }
      const data = (await res.json()) as { result: TaxReportDreFollowUp };
      return { report: null, dre: data.result };
    }
    const res = await fetch("/api/reports/monthly-tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, mode: "preview" }),
    });
    if (!res.ok) {
      return {
        report: null,
        dre: null,
        error: await readApiError(res, "monthly_tax_generate_failed"),
      };
    }
    const data = (await res.json()) as { preview: TaxRecalcPreview };
    return { report: data.preview.report, dre: data.preview.dre };
  } catch {
    return { report: null, dre: null, error: "Falha de rede ao calcular a prévia." };
  }
}

/**
 * Confirmação com prévia (antes → depois) para recalcular o tributário ou o
 * imposto do DRE. A prévia é só banco e não grava nada; ao confirmar o diálogo
 * fecha e a ação roda (o progresso aparece na tela que a chamou).
 */
export function useTaxRecalcConfirm({
  year,
  labelFor,
  onConfirmed,
}: {
  year: number;
  labelFor: (month: number) => string;
  onConfirmed: (kind: TaxRecalcKind, months: number[]) => void;
}) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const request = useCallback(
    (kind: TaxRecalcKind, months: number[]) => {
      const unique = [...new Set(months)].sort((a, b) => a - b);
      if (unique.length === 0) return;
      setState({
        kind,
        months: unique.map((month) => ({
          month,
          label: labelFor(month),
          report: null,
          dre: null,
        })),
        loading: kind !== "regenerate",
      });
      if (kind === "regenerate") return;
      void Promise.all(
        unique.map(async (month) => ({
          month,
          ...(await loadPreview(kind, year, month)),
        })),
      ).then((previews) => {
        setState((prev) =>
          prev && prev.kind === kind
            ? {
                ...prev,
                loading: false,
                months: prev.months.map((row) => {
                  const preview = previews.find((p) => p.month === row.month);
                  return preview ? { ...row, ...preview } : row;
                }),
              }
            : prev,
        );
      });
    },
    [year, labelFor],
  );

  const confirm = useCallback(() => {
    if (!state) return;
    const { kind, months } = state;
    setState(null);
    onConfirmed(
      kind,
      months.map((row) => row.month),
    );
  }, [state, onConfirmed]);

  const cancel = useCallback(() => setState(null), []);

  return {
    requestConfirm: request,
    dialogProps: {
      open: state !== null,
      kind: state?.kind ?? ("recompute" as TaxRecalcKind),
      months: state?.months ?? [],
      loading: state?.loading ?? false,
      confirming: false,
      onConfirm: confirm,
      onCancel: cancel,
    },
  };
}
