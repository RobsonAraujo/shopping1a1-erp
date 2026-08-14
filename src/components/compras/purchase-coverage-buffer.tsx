"use client";

import { useCallback, useId, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS,
  PURCHASE_COVERAGE_BUFFER_STORAGE_KEY,
  PURCHASE_COVERAGE_BUFFER_TOOLTIP,
} from "@/lib/purchase-analysis";
import { Card, CardContent } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { MetricWithHint } from "@/components/metric-with-hint";

const BUFFER_CHANGE_EVENT = "compras-buffer-change";

function readStoredBufferDays(): number {
  if (typeof window === "undefined") {
    return DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS;
  }
  try {
    const raw = localStorage.getItem(PURCHASE_COVERAGE_BUFFER_STORAGE_KEY);
    if (raw === null) return DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS;
    }
    return Math.floor(parsed);
  } catch {
    return DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS;
  }
}

function subscribeToBufferStore(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const notify = () => onStoreChange();
  window.addEventListener(BUFFER_CHANGE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(BUFFER_CHANGE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

export function usePurchaseCoverageBufferDays() {
  const bufferDays = useSyncExternalStore(
    subscribeToBufferStore,
    readStoredBufferDays,
    () => DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS,
  );

  const setBufferDays = useCallback((value: number) => {
    const normalized = Math.max(0, Math.floor(value));
    try {
      localStorage.setItem(
        PURCHASE_COVERAGE_BUFFER_STORAGE_KEY,
        String(normalized),
      );
    } catch {
      // ignore quota / private mode
    }
    window.dispatchEvent(new Event(BUFFER_CHANGE_EVENT));
  }, []);

  return { bufferDays, setBufferDays };
}

type PurchaseCoverageBufferControlProps = {
  bufferDays: number;
  onBufferDaysChange: (value: number) => void;
  className?: string;
};

export function PurchaseCoverageBufferControl({
  bufferDays,
  onBufferDaysChange,
  className,
}: PurchaseCoverageBufferControlProps) {
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const displayedDays = draft !== null && draft.trim() !== "" && Number.isFinite(Number(draft))
    ? Math.max(0, Math.floor(Number(draft)))
    : bufferDays;

  function commitDraft() {
    const value = draft ?? String(bufferDays);
    const trimmed = value.trim();
    if (trimmed === "") {
      onBufferDaysChange(DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS);
      setDraft(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(null);
      return;
    }
    onBufferDaysChange(parsed);
    setDraft(null);
  }

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <MetricWithHint content={PURCHASE_COVERAGE_BUFFER_TOOLTIP}>
            <span className="text-sm font-medium text-[var(--foreground)]">
              Buffer de estoque (dias)
            </span>
          </MetricWithHint>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Usando {displayedDays} {displayedDays === 1 ? "dia" : "dias"} (padrão:{" "}
            {DEFAULT_PURCHASE_COVERAGE_BUFFER_DAYS}). Salvo neste navegador.
          </p>
        </div>
        <div className="w-full sm:w-36">
          <FormInput
            id={inputId}
            aria-label="Buffer de estoque em dias"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={draft ?? String(bufferDays)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            inputClassName="tabular-nums"
          />
        </div>
      </CardContent>
    </Card>
  );
}
