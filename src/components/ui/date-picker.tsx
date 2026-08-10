"use client";

import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  localDateToYmd,
  ymdToLocalDate,
} from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  valueYmd: string;
  onChange: (ymd: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  labelClassName?: string;
  placeholder?: string;
  /** When true, dates after today cannot be selected. Default true. */
  disableFuture?: boolean;
};

export function DatePicker({
  valueYmd,
  onChange,
  label,
  id,
  disabled,
  className,
  buttonClassName,
  labelClassName,
  placeholder = "Escolher data",
  disableFuture = true,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const selected = React.useMemo(
    () => ymdToLocalDate(valueYmd),
    [valueYmd],
  );

  const buttonId =
    id ??
    (label ? `date-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  const triggerButton = (
    <Button
      id={buttonId}
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className={cn(
        "h-10 w-full justify-start gap-2 font-normal",
        !selected && "text-[var(--muted-foreground)]",
        buttonClassName,
      )}
    >
      <CalendarIcon className="size-4 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">
        {selected
          ? format(selected, "dd MMM yyyy", { locale: ptBR })
          : placeholder}
      </span>
    </Button>
  );

  const calendar = (
    <Calendar
      mode="single"
      locale={ptBR}
      defaultMonth={selected ?? new Date()}
      selected={selected}
      onSelect={(date) => {
        if (!date) return;
        onChange(localDateToYmd(date));
        setOpen(false);
      }}
      disabled={disableFuture ? { after: new Date() } : undefined}
      className="mx-auto"
    />
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label
          htmlFor={buttonId}
          className={cn(
            "block text-xs font-medium text-[var(--muted-foreground)]",
            labelClassName,
          )}
        >
          {label}
        </label>
      ) : null}
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{triggerButton}</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{label ?? "Escolher data"}</SheetTitle>
            </SheetHeader>
            <div className="flex justify-center px-4 pb-6">{calendar}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto max-w-none p-0"
            data-slot="popover-content"
          >
            {calendar}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
