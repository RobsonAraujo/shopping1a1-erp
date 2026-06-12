"use client";

import { NumericFormat } from "react-number-format";

const inputClassName =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm";

type MaskedMoneyFieldProps = {
  id: string;
  label: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
};

export function MaskedMoneyField({
  id,
  label,
  value,
  onValueChange,
}: MaskedMoneyFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <NumericFormat
        id={id}
        value={value ?? ""}
        onValueChange={(values) => {
          onValueChange(values.floatValue ?? null);
        }}
        thousandSeparator="."
        decimalSeparator=","
        prefix="R$ "
        decimalScale={2}
        allowNegative={false}
        autoComplete="off"
        placeholder="R$ 0,00"
        className={`${inputClassName} px-3 py-2`}
      />
    </div>
  );
}

type MaskedPercentFieldProps = {
  id: string;
  label: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
};

export function MaskedPercentField({
  id,
  label,
  value,
  onValueChange,
}: MaskedPercentFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <NumericFormat
        id={id}
        value={value ?? ""}
        onValueChange={(values) => {
          onValueChange(values.floatValue ?? null);
        }}
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
        className={`${inputClassName} px-3 py-2`}
      />
    </div>
  );
}
