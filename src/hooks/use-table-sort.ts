"use client";

import { useMemo, useState } from "react";
import type { TableSort } from "@/components/ui/sortable-th";

/**
 * Estado + ordenação genéricos para tabelas com colunas clicáveis.
 * `getValue` extrai o valor comparável (string | number) de uma linha para uma dada chave.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => string | number,
  initialSort: TableSort<K>,
) {
  const [sort, setSort] = useState<TableSort<K>>(initialSort);

  const sortedRows = useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getValue(a, sort.key);
      const vb = getValue(b, sort.key);
      if (typeof va === "string" || typeof vb === "string") {
        return dir * String(va).localeCompare(String(vb), "pt-BR");
      }
      return dir * (va - vb);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  const onSortChange = (key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" },
    );
  };

  return { sort, sortedRows, onSortChange };
}
