"use client";

import { useRouter } from "next/navigation";
import { FormSelect, type SelectOption } from "@/components/ui/form-select";
import { MONTH_NAMES_PT } from "@/lib/inventory/inventory-stock-report";
import type { InventoryMonthSnapshotSource } from "@/generated/prisma/client";

export type InventoryHistoryMonthOption = {
  year: number;
  month: number;
  source?: InventoryMonthSnapshotSource;
};

function monthValue(option: InventoryHistoryMonthOption): string {
  return `${option.year}-${option.month}`;
}

export function InventoryHistoryMonthPicker({
  months,
  selected,
}: {
  months: InventoryHistoryMonthOption[];
  selected: InventoryHistoryMonthOption;
}) {
  const router = useRouter();

  const options: SelectOption[] = months.map((option) => ({
    value: monthValue(option),
    label:
      option.source === "manual"
        ? `${MONTH_NAMES_PT[option.month - 1]} de ${option.year} (snapshot manual)`
        : `${MONTH_NAMES_PT[option.month - 1]} de ${option.year}`,
  }));

  return (
    <FormSelect
      label="Mês fechado"
      value={monthValue(selected)}
      onValueChange={(value) => {
        const [year, month] = value.split("-");
        router.push(`/dashboard/inventory/historico?year=${year}&month=${month}`);
      }}
      options={options}
      triggerClassName="min-w-[12rem]"
    />
  );
}
