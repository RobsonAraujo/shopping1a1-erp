"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
};

type FormSelectProps = {
  id?: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
};

export function FormSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder = "Selecione…",
  disabled,
  className,
  triggerClassName,
  "aria-label": ariaLabel,
}: FormSelectProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-[var(--muted-foreground)]"
        >
          {label}
        </label>
      ) : null}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={cn("min-w-[8rem]", triggerClassName)}
          aria-label={ariaLabel ?? label}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
