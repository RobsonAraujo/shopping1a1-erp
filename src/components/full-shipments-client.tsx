"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { FullShipmentImportOverlay } from "@/components/full-shipment-import-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { readApiError } from "@/lib/api-client-error";
import {
  computeCostPerUnit,
  type FullShipmentRecord,
} from "@/lib/full-shipment";
import { formatFinancialMoney } from "@/lib/financial-margin";
import { getZonedYearMonth } from "@/lib/mercadolibre/revenue-periods";
import { TAX_REPORT_MONTH_NAMES } from "@/lib/tax-report/routes";
import { cn } from "@/lib/utils";

type FullShipmentsClientProps = {
  initialShipments: FullShipmentRecord[];
  initialYear: number;
  initialMonth: number;
  initialImportedPeriods: Array<{ year: number; month: number }>;
};

type ShipmentFormState = {
  shippedAt: string;
  totalCost: string;
  totalUnits: string;
  notes: string;
};

type ImportResultMessage = {
  tone: "success" | "warning" | "info";
  text: string;
};

function emptyForm(): ShipmentFormState {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return {
    shippedAt: `${yyyy}-${mm}-${dd}`,
    totalCost: "",
    totalUnits: "",
    notes: "",
  };
}

function formFromShipment(shipment: FullShipmentRecord): ShipmentFormState {
  const date = new Date(shipment.shippedAt);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return {
    shippedAt: `${yyyy}-${mm}-${dd}`,
    totalCost: String(shipment.totalCost),
    totalUnits: String(shipment.totalUnits),
    notes: shipment.notes ?? "",
  };
}

function formatShipmentDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function sourceLabel(source: FullShipmentRecord["source"]): string {
  return source === "ml_billing" ? "ML" : "Manual";
}

function parsePreviewCostPerUnit(
  totalCost: string,
  totalUnits: string,
): number | null {
  const cost = Number(totalCost);
  const units = Number(totalUnits);
  if (!Number.isFinite(cost) || !Number.isInteger(units) || units <= 0) {
    return null;
  }
  try {
    return computeCostPerUnit(cost, units);
  } catch {
    return null;
  }
}

function buildImportMessage(data: {
  imported?: number;
  skipped?: number;
  replaced?: number;
  foundInBilling?: number;
  year: number;
  month: number;
}): ImportResultMessage {
  const monthName =
    TAX_REPORT_MONTH_NAMES[data.month - 1] ?? String(data.month);
  const imported = data.imported ?? 0;
  const found = data.foundInBilling ?? 0;
  const replaced = data.replaced ?? 0;

  if (found === 0) {
    return {
      tone: "warning",
      text: `Nenhuma coleta Full encontrada em ${monthName}/${data.year}. Verifique se os envios já foram recebidos no Full neste mês.`,
    };
  }

  const replacedText =
    replaced > 0
      ? ` ${replaced} registro(s) antigo(s) do mês foram substituídos.`
      : "";

  const unitsHint =
    imported > 0
      ? " Unidades e datas vieram das operações ML; custos do faturamento quando disponíveis."
      : "";

  return {
    tone: "success",
    text: `${imported} coleta(s) de ${monthName}/${data.year} importada(s) (${found} envio(s) agrupado(s) por inbound_id).${replacedText}${unitsHint}`,
  };
}

export function FullShipmentsClient({
  initialShipments,
  initialYear,
  initialMonth,
  initialImportedPeriods,
}: FullShipmentsClientProps) {
  const now = getZonedYearMonth();
  const [shipments, setShipments] =
    useState<FullShipmentRecord[]>(initialShipments);
  const [importedPeriods, setImportedPeriods] = useState(
    initialImportedPeriods,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FullShipmentRecord | null>(null);
  const [form, setForm] = useState<ShipmentFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importMessageTone, setImportMessageTone] = useState<
    "success" | "warning" | "info"
  >("info");
  const [error, setError] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const loadRequestIdRef = useRef(0);
  const skipInitialLoadRef = useRef(true);
  const prevViewPeriodRef = useRef({ year: initialYear, month: initialMonth });

  const previewCostPerUnit = useMemo(
    () => parsePreviewCostPerUnit(form.totalCost, form.totalUnits),
    [form.totalCost, form.totalUnits],
  );

  const yearOptions = useMemo(() => {
    const years = [now.year - 1, now.year, now.year + 1];
    return years.map((year) => ({
      value: String(year),
      label: String(year),
    }));
  }, [now.year]);

  const monthOptions = useMemo(
    () =>
      TAX_REPORT_MONTH_NAMES.map((name, index) => ({
        value: String(index + 1),
        label: name,
      })),
    [],
  );

  const viewMonthName =
    TAX_REPORT_MONTH_NAMES[viewMonth - 1] ?? String(viewMonth);

  const periodSummary = useMemo(() => {
    const totalCost = shipments.reduce((sum, row) => sum + row.totalCost, 0);
    const totalUnits = shipments.reduce((sum, row) => sum + row.totalUnits, 0);
    return {
      count: shipments.length,
      totalCost,
      totalUnits,
      costPerUnit:
        totalUnits > 0 ? computeCostPerUnit(totalCost, totalUnits) : null,
    };
  }, [shipments]);

  const periodIsImported = useMemo(
    () =>
      importedPeriods.some(
        (period) => period.year === viewYear && period.month === viewMonth,
      ),
    [importedPeriods, viewYear, viewMonth],
  );

  const loadShipmentsForPeriod = useCallback(
    async (year: number, month: number, requestId: number) => {
      const res = await fetch(
        `/api/full-shipments?year=${year}&month=${month}`,
      );
      const data = (await res.json()) as {
        shipments?: FullShipmentRecord[];
        importedPeriods?: Array<{ year: number; month: number }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Não foi possível carregar os envios.");
      }
      if (requestId !== loadRequestIdRef.current) return;

      setShipments(data.shipments ?? []);
      if (data.importedPeriods) {
        setImportedPeriods(data.importedPeriods);
      }
    },
    [],
  );

  useEffect(() => {
    if (importing) return;

    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      return;
    }

    const requestId = ++loadRequestIdRef.current;
    let cancelled = false;
    const periodChanged =
      prevViewPeriodRef.current.year !== viewYear ||
      prevViewPeriodRef.current.month !== viewMonth;
    prevViewPeriodRef.current = { year: viewYear, month: viewMonth };
    setLoading(true);
    if (periodChanged) {
      setError(null);
    }
    void loadShipmentsForPeriod(viewYear, viewMonth, requestId)
      .catch((e: unknown) => {
        if (!cancelled && requestId === loadRequestIdRef.current) {
          setError(
            e instanceof Error ? e.message : "Não foi possível carregar os envios.",
          );
        }
      })
      .finally(() => {
        if (!cancelled && requestId === loadRequestIdRef.current) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth, importing, loadShipmentsForPeriod]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((shipment: FullShipmentRecord) => {
    setEditing(shipment);
    setForm(formFromShipment(shipment));
    setError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditing(null);
    setError(null);
  }, []);

  async function reloadShipments() {
    const requestId = ++loadRequestIdRef.current;
    await loadShipmentsForPeriod(viewYear, viewMonth, requestId);
  }

  async function handleSave() {
    const totalCost = Number(form.totalCost);
    const totalUnits = Number(form.totalUnits);
    if (!form.shippedAt) {
      setError("Informe a data do envio.");
      return;
    }
    if (!Number.isFinite(totalCost) || totalCost < 0) {
      setError("Informe um custo total válido.");
      return;
    }
    if (!Number.isInteger(totalUnits) || totalUnits <= 0) {
      setError("Informe um total de unidades inteiro maior que zero.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        shippedAt: new Date(`${form.shippedAt}T12:00:00.000Z`).toISOString(),
        totalCost,
        totalUnits,
        notes: form.notes.trim() || null,
      };

      const res = await fetch(
        editing
          ? `/api/full-shipments/${encodeURIComponent(editing.id)}`
          : "/api/full-shipments",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        shipment?: FullShipmentRecord;
        error?: string;
      };
      if (!res.ok) {
        setError(
          data.error ?? (await readApiError(res, "full_shipment_save_failed")),
        );
        return;
      }

      await reloadShipments();
      closeModal();
    } catch {
      setError("Falha de rede. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(shipment: FullShipmentRecord) {
    if (
      !window.confirm(
        `Excluir o envio de ${formatShipmentDate(shipment.shippedAt)}?`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/full-shipments/${encodeURIComponent(shipment.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        window.alert(data.error ?? "Não foi possível excluir.");
        return;
      }
      await reloadShipments();
    } catch {
      window.alert("Falha de rede. Tente de novo.");
    }
  }

  async function handleImport() {
    if (importing) return;

    if (!Number.isInteger(viewYear) || !Number.isInteger(viewMonth)) {
      setImportMessage("Informe ano e mês válidos.");
      setImportMessageTone("warning");
      return;
    }

    ++loadRequestIdRef.current;
    setImporting(true);
    setImportMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/full-shipments/import-ml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: viewYear, month: viewMonth }),
      });
      const data = (await res.json()) as {
        imported?: number;
        skipped?: number;
        replaced?: number;
        foundInBilling?: number;
        error?: string;
      };
      if (!res.ok) {
        const message =
          data.error ??
          (await readApiError(res, "full_shipments_import_failed"));
        setError(message);
        return;
      }

      const message = buildImportMessage({
        imported: data.imported,
        skipped: data.skipped,
        replaced: data.replaced,
        foundInBilling: data.foundInBilling,
        year: viewYear,
        month: viewMonth,
      });
      setImportMessage(message.text);
      setImportMessageTone(message.tone);
      await reloadShipments();
    } catch {
      setError("Falha de rede ao importar. Tente de novo.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {importing ? (
        <FullShipmentImportOverlay
          progress={{
            message: `Buscando coletas Full de ${viewMonthName}/${viewYear}…`,
          }}
        />
      ) : null}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-900 shadow-sm">
            <Truck className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
              Envios Full
            </h1>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              O objetivo desta página é descobrir{" "}
              <strong>quanto você gastou por unidade</strong> em cada coleta
              enviada ao Full: <strong>custo total ÷ unidades enviadas</strong>.
              Esse valor vira um custo extra por peça — útil para entender a
              margem real depois do envio ao Mercado Livre.
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
              O <strong>custo da coleta</strong> e as <strong>unidades</strong>{" "}
              podem ser importados do faturamento ML por mês. Escolha o período
              acima para visualizar envios já importados ou registrar manualmente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <FormSelect
            id="full-shipment-view-year"
            label="Ano"
            value={String(viewYear)}
            onValueChange={(value) => setViewYear(Number(value))}
            options={yearOptions}
            disabled={importing || loading}
            triggerClassName="w-[7.5rem]"
          />
          <FormSelect
            id="full-shipment-view-month"
            label="Mês"
            value={String(viewMonth)}
            onValueChange={(value) => setViewMonth(Number(value))}
            options={monthOptions}
            disabled={importing || loading}
            triggerClassName="w-[10.5rem]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={importing || loading}
            onClick={() => void handleImport()}
          >
            <Download className="size-3.5" aria-hidden />
            Importar ML
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={importing || loading}
            onClick={openCreate}
          >
            <Plus className="size-3.5" aria-hidden />
            Registrar envio
          </Button>
        </div>
      </header>

      {error ? (
        <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
          {error}
        </Card>
      ) : null}

      {importMessage ? (
        <Card
          className={cn(
            "p-4 text-sm",
            importMessageTone === "success" &&
              "border-emerald-200 bg-emerald-50/70 text-emerald-900",
            importMessageTone === "warning" &&
              "border-amber-200 bg-amber-50/70 text-amber-950",
            importMessageTone === "info" &&
              "border-sky-200 bg-sky-50/70 text-sky-950",
          )}
        >
          {importMessage}
        </Card>
      ) : null}

      <Card className="p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <p className="font-medium text-[var(--primary)]">
            {viewMonthName}/{viewYear}
          </p>
          <p className="text-[var(--muted-foreground)]">
            {loading
              ? "Carregando envios…"
              : [
                  `${periodSummary.count} envio(s)`,
                  formatFinancialMoney(periodSummary.totalCost),
                  `${periodSummary.totalUnits} un.`,
                  periodSummary.costPerUnit != null
                    ? `${formatFinancialMoney(periodSummary.costPerUnit)}/un.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          {periodIsImported ? (
            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
              Faturamento importado
            </Badge>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/80">
              <tr>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Envio ML
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Data
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Produtos
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Custo total
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Unidades
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Custo/un.
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Origem
                </th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-[var(--muted-foreground)]"
                  >
                    {loading
                      ? "Carregando envios…"
                      : `Nenhum envio em ${viewMonthName}/${viewYear}. Importe do faturamento ML ou registre manualmente.`}
                  </td>
                </tr>
              ) : (
                shipments.map((shipment) => {
                  const needsUnits = shipment.totalUnits === 0;
                  const needsCost =
                    shipment.source === "ml_billing" && shipment.totalCost === 0;
                  const inboundLabel = shipment.mlInboundId
                    ? shipment.mlInboundId.startsWith("unassigned-")
                      ? "—"
                      : `N.º ${shipment.mlInboundId}`
                    : "—";
                  return (
                    <tr
                      key={shipment.id}
                      className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--muted)]/40"
                    >
                      <td className="px-4 py-3.5 tabular-nums font-medium">
                        {inboundLabel}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        {formatShipmentDate(shipment.shippedAt)}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        {shipment.productCount && shipment.productCount > 0
                          ? shipment.productCount
                          : "—"}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {formatFinancialMoney(shipment.totalCost)}
                          {needsCost ? (
                            <Badge
                              variant="warning"
                              className="h-5 px-1.5 text-[10px]"
                            >
                              Custo pendente
                            </Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          {needsUnits ? "—" : shipment.totalUnits}
                          {needsUnits ? (
                            <Badge
                              variant="warning"
                              className="h-5 px-1.5 text-[10px]"
                            >
                              Completar unidades
                            </Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums font-medium">
                        {needsUnits
                          ? "—"
                          : `${formatFinancialMoney(shipment.costPerUnit)}/un.`}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                        {sourceLabel(shipment.source)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => openEdit(shipment)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            title="Excluir envio"
                            aria-label="Excluir envio"
                            onClick={() => void handleDelete(shipment)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modalOpen ? (
        <ShipmentModal
          editing={editing}
          form={form}
          error={error}
          saving={saving}
          previewCostPerUnit={previewCostPerUnit}
          onClose={closeModal}
          onChange={setForm}
          onSave={() => void handleSave()}
        />
      ) : null}
    </div>
  );
}

function ShipmentModal({
  editing,
  form,
  error,
  saving,
  previewCostPerUnit,
  onClose,
  onChange,
  onSave,
}: {
  editing: FullShipmentRecord | null;
  form: ShipmentFormState;
  error: string | null;
  saving: boolean;
  previewCostPerUnit: number | null;
  onClose: () => void;
  onChange: (form: ShipmentFormState) => void;
  onSave: () => void;
}) {
  const labelId = useId();
  const descId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={labelId}
          className="text-lg font-semibold text-[var(--primary)]"
        >
          {editing ? "Editar envio Full" : "Registrar envio Full"}
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]"
        >
          Informe quanto pagou na coleta e quantas unidades foram enviadas no
          total para calcular o custo por unidade.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="shipment-date"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Data do envio
            </label>
            <input
              id="shipment-date"
              type="date"
              value={form.shippedAt}
              onChange={(e) => onChange({ ...form, shippedAt: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </div>

          <div>
            <label
              htmlFor="shipment-cost"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Custo total pago (R$)
            </label>
            <input
              id="shipment-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={form.totalCost}
              onChange={(e) => onChange({ ...form, totalCost: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </div>

          <div>
            <label
              htmlFor="shipment-units"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Total de unidades enviadas
            </label>
            <input
              id="shipment-units"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.totalUnits}
              onChange={(e) =>
                onChange({ ...form, totalUnits: e.target.value })
              }
              className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </div>

          <div>
            <label
              htmlFor="shipment-notes"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Notas (opcional)
            </label>
            <textarea
              id="shipment-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </div>

          {previewCostPerUnit !== null ? (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-sm">
              Custo por unidade:{" "}
              <strong>{formatFinancialMoney(previewCostPerUnit)}/un.</strong>
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
