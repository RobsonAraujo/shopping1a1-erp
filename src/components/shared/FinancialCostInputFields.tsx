"use client";

import type { ReactNode } from "react";
import { NumericFormat } from "react-number-format";
import { cn } from "@/lib/utils";

/** Mesma casca do `FormInput`/`FormSelect` (altura, sombra, foco e rótulo):
 *  campos de dinheiro e percentual convivem com eles na mesma grade, e
 *  qualquer divergência de altura desalinha as linhas do formulário. */
const inputClassName = cn(
  "flex h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--foreground)] shadow-sm transition-colors sm:h-10 sm:text-sm",
  "placeholder:text-[var(--muted-foreground)] hover:bg-[var(--accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30 disabled:cursor-not-allowed disabled:opacity-50",
);

const labelClassName =
  "block text-xs font-medium text-[var(--muted-foreground)]";

function FieldShell({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type MaskedFieldProps = {
  id: string;
  label: string;
  value: number | null;
  onValueChange?: (value: number | null) => void;
  readOnly?: boolean;
  hint?: ReactNode;
  className?: string;
};

export function MaskedMoneyField({
  id,
  label,
  value,
  onValueChange,
  readOnly = false,
  hint,
  className,
}: MaskedFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <NumericFormat
        id={id}
        value={value ?? ""}
        onValueChange={
          readOnly
            ? undefined
            : (values) => {
                onValueChange?.(values.floatValue ?? null);
              }
        }
        readOnly={readOnly}
        disabled={readOnly}
        thousandSeparator="."
        decimalSeparator=","
        prefix="R$ "
        decimalScale={2}
        allowNegative={false}
        autoComplete="off"
        placeholder="R$ 0,00"
        className={cn(inputClassName, readOnly && "cursor-default opacity-80")}
      />
    </FieldShell>
  );
}

export function MaskedPercentField({
  id,
  label,
  value,
  onValueChange,
  readOnly = false,
  hint,
  className,
}: MaskedFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} className={className}>
      <NumericFormat
        id={id}
        value={value ?? ""}
        onValueChange={
          readOnly
            ? undefined
            : (values) => {
                onValueChange?.(values.floatValue ?? null);
              }
        }
        readOnly={readOnly}
        disabled={readOnly}
        thousandSeparator="."
        decimalSeparator=","
        suffix=" %"
        decimalScale={2}
        allowNegative={false}
        isAllowed={(values) => {
          const { floatValue } = values;
          return floatValue === undefined || floatValue <= 100;
        }}
        autoComplete="off"
        placeholder="0,00 %"
        className={cn(inputClassName, readOnly && "cursor-default opacity-80")}
      />
    </FieldShell>
  );
}
