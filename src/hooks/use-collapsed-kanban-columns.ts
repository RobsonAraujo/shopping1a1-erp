"use client";

import { useCallback, useState } from "react";
import type { OperationCycleKind } from "@/generated/prisma/client";

function storageKey(kind: OperationCycleKind) {
  return `ops-kanban-collapsed-columns:${kind}`;
}

function readCollapsed(kind: OperationCycleKind): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/** Preferência de UI por navegador (não é dado de negócio) — lembra quais
 * colunas do Kanban (Compras ou Operações Full) o usuário recolheu, pra não
 * precisar esconder os cards de verdade pra "sumir" com uma coluna cheia.
 * Chave = `KanbanColumn.id` (as colunas são livres por organização agora,
 * não mais o enum fixo de status). `kind` é fixo por board montado (a
 * página não troca de board sem remontar), então ler o valor inicial de
 * forma preguiçosa dispensa efeito. */
export function useCollapsedKanbanColumns(kind: OperationCycleKind) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(kind));

  const toggle = useCallback(
    (columnId: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(columnId)) {
          next.delete(columnId);
        } else {
          next.add(columnId);
        }
        try {
          window.localStorage.setItem(storageKey(kind), JSON.stringify([...next]));
        } catch {
          // localStorage indisponível (modo privado, quota) — segue só em memória
        }
        return next;
      });
    },
    [kind],
  );

  return { collapsed, toggle };
}
