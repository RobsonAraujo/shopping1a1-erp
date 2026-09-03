"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  localDateToYmd,
  ymdToLocalDate,
} from "@/components/ui/date-range-picker";

export function periodLabel(startDate: string, endDate: string): string {
  const from = ymdToLocalDate(startDate);
  const to = ymdToLocalDate(endDate);
  if (!from || !to) return `${startDate} – ${endDate}`;
  if (startDate === endDate) {
    return format(from, "dd MMM yyyy", { locale: ptBR });
  }
  return `${format(from, "dd MMM yyyy", { locale: ptBR })} – ${format(to, "dd MMM yyyy", { locale: ptBR })}`;
}

export function PeriodDateRangeField({
  startDate,
  endDate,
  onChange,
  disabled,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);

  function openPicker() {
    setDraft({
      from: ymdToLocalDate(startDate),
      to: ymdToLocalDate(endDate),
    });
    setOpen(true);
  }

  function cancelPicker() {
    setDraft(undefined);
    setOpen(false);
  }

  function applyPicker() {
    if (!draft?.from) return;
    const from = localDateToYmd(draft.from);
    const to = localDateToYmd(draft.to ?? draft.from);
    onChange(from, to);
    setDraft(undefined);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        cancelPicker();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancelPicker();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const canApply = Boolean(draft?.from);

  return (
    <div ref={rootRef} className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--muted-foreground)]">
        Período
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="h-10 w-full justify-start gap-2 font-normal"
        onClick={() => {
          if (open) cancelPicker();
          else openPicker();
        }}
      >
        <CalendarIcon className="size-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{periodLabel(startDate, endDate)}</span>
      </Button>
      {open ? (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] shadow-sm">
          <div className="p-2">
            <Calendar
              mode="range"
              locale={ptBR}
              defaultMonth={draft?.from ?? draft?.to ?? new Date()}
              selected={draft}
              onSelect={(range) => {
                setDraft(range);
              }}
              numberOfMonths={1}
              className="mx-auto"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={cancelPicker}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={!canApply}
              onClick={applyPicker}
            >
              Aplicar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
