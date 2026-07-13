"use client";

import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function ymdToLocalDate(ymd: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export function localDateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type DateRangePickerProps = {
  fromYmd: string;
  toYmd: string;
  onChange: (fromYmd: string, toYmd: string) => void;
  disabled?: boolean;
  className?: string;
  numberOfMonths?: number;
  /** When true, dates after today cannot be selected. Default true. */
  disableFuture?: boolean;
};

export function DateRangePicker({
  fromYmd,
  toYmd,
  onChange,
  disabled,
  className,
  numberOfMonths = 2,
  disableFuture = true,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected: DateRange | undefined = React.useMemo(() => {
    const from = ymdToLocalDate(fromYmd);
    const to = ymdToLocalDate(toYmd);
    if (!from && !to) return undefined;
    return { from, to };
  }, [fromYmd, toYmd]);

  const label = React.useMemo(() => {
    const from = selected?.from;
    const to = selected?.to;
    if (from && to) {
      if (localDateToYmd(from) === localDateToYmd(to)) {
        return format(from, "dd MMM yyyy", { locale: ptBR });
      }
      return `${format(from, "dd MMM yyyy", { locale: ptBR })} – ${format(to, "dd MMM yyyy", { locale: ptBR })}`;
    }
    if (from) {
      return format(from, "dd MMM yyyy", { locale: ptBR });
    }
    return "Escolher período";
  }, [selected]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-[38px] min-w-[220px] justify-start gap-2 font-normal",
            !selected?.from && "text-[var(--muted-foreground)]",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-none p-0"
        data-slot="popover-content"
      >
        <Calendar
          mode="range"
          locale={ptBR}
          defaultMonth={selected?.from ?? selected?.to ?? new Date()}
          selected={selected}
          onSelect={(range) => {
            if (!range?.from) return;
            const from = localDateToYmd(range.from);
            const to = localDateToYmd(range.to ?? range.from);
            onChange(from, to);
          }}
          numberOfMonths={numberOfMonths}
          disabled={disableFuture ? { after: new Date() } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
