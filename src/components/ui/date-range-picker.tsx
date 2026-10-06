"use client";

import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
  /** Chamado a cada clique no calendário (o 1º clique já manda de == até). */
  onChange?: (fromYmd: string, toYmd: string) => void;
  /**
   * Quando informado, a seleção vira rascunho e só é confirmada no botão
   * "Aplicar" — evita disparar uma busca no 1º clique do intervalo.
   */
  onCommit?: (fromYmd: string, toYmd: string) => void;
  disabled?: boolean;
  className?: string;
  /** Texto fixo do botão (ex.: "Personalizado") no lugar das datas. */
  triggerLabel?: string;
  numberOfMonths?: number;
  /** When true, dates after today cannot be selected. Default true. */
  disableFuture?: boolean;
  /** Inclusive max span in days. Selection beyond this is ignored with a hint. */
  maxDays?: number;
};

export function DateRangePicker({
  fromYmd,
  toYmd,
  onChange,
  onCommit,
  disabled,
  className,
  triggerLabel,
  numberOfMonths = 2,
  disableFuture = true,
  maxDays,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [rangeHint, setRangeHint] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ from: string; to: string } | null>(
    null,
  );
  const isMobile = useIsMobile();
  const committedSelection: DateRange | undefined = React.useMemo(() => {
    const from = ymdToLocalDate(fromYmd);
    const to = ymdToLocalDate(toYmd);
    if (!from && !to) return undefined;
    return { from, to };
  }, [fromYmd, toYmd]);
  const selected: DateRange | undefined = React.useMemo(() => {
    if (!onCommit || !draft) return committedSelection;
    return { from: ymdToLocalDate(draft.from), to: ymdToLocalDate(draft.to) };
  }, [onCommit, draft, committedSelection]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setDraft(null);
      setRangeHint(null);
    }
  };

  const commitDraft = () => {
    if (onCommit && draft) onCommit(draft.from, draft.to);
    setOpen(false);
  };

  const label = React.useMemo(() => {
    if (triggerLabel) return triggerLabel;
    const from = committedSelection?.from;
    const to = committedSelection?.to;
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
  }, [committedSelection, triggerLabel]);

  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className={cn(
        "h-[38px] justify-start gap-2 font-normal",
        !triggerLabel && "min-w-[220px]",
        !committedSelection?.from && !triggerLabel && "text-[var(--muted-foreground)]",
        className,
      )}
    >
      <CalendarIcon className="size-4 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{label}</span>
    </Button>
  );

  const calendar = (
    <div className="space-y-2">
      <Calendar
        mode="range"
        locale={ptBR}
        defaultMonth={selected?.from ?? selected?.to ?? new Date()}
        selected={selected}
        onSelect={(range) => {
          if (!range?.from) return;
          const from = localDateToYmd(range.from);
          const toDate = range.to ?? range.from;
          const to = localDateToYmd(toDate);
          if (maxDays != null) {
            // inclusivo: 01→30 são 30 dias
            const spanDays =
              Math.round(
                (toDate.getTime() - range.from.getTime()) / 86_400_000,
              ) + 1;
            if (spanDays > maxDays) {
              setRangeHint(
                `O período pode ter no máximo ${maxDays} dias. Ajuste as datas e tente de novo.`,
              );
              return;
            }
          }
          setRangeHint(null);
          if (onCommit) setDraft({ from, to });
          onChange?.(from, to);
        }}
        numberOfMonths={isMobile ? 1 : numberOfMonths}
        disabled={disableFuture ? { after: new Date() } : undefined}
        className="mx-auto"
      />
      {rangeHint ? (
        <div className="px-3 pb-3">
          <UserFeedback tone="warning" title="Período longo demais">
            {rangeHint}
          </UserFeedback>
        </div>
      ) : null}
      {onCommit && !isMobile ? (
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button type="button" size="sm" disabled={!draft} onClick={commitDraft}>
            Aplicar
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Escolher período</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center px-4 pb-2">{calendar}</div>
          <SheetFooter>
            <Button
              type="button"
              disabled={Boolean(onCommit) && !draft}
              onClick={commitDraft}
            >
              Aplicar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-none p-0"
        data-slot="popover-content"
      >
        {calendar}
      </PopoverContent>
    </Popover>
  );
}
