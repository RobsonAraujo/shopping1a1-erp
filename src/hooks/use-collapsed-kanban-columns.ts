"use client";

import { useCallback, useState } from "react";
import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";

function storageKey(kind: OperationCycleKind) {
  return `ops-kanban-collapsed-columns:${kind}`;
}

function readCollapsed(kind: OperationCycleKind): Set<ReplenishmentStatus> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    return raw ? new Set(JSON.parse(raw) as ReplenishmentStatus[]) : new Set();
  } catch {
    return new Set();
  }
}

/** Preferência de UI por navegador (não é dado de negócio) — lembra quais
 * colunas do Kanban (Compras ou Operações Full) o usuário recolheu, pra não
 * precisar esconder os cards de verdade pra "sumir" com uma coluna cheia.
 * `kind` é fixo por board montado (a página não troca de board sem
 * remontar), então ler o valor inicial de forma preguiçosa dispensa efeito. */
export function useCollapsedKanbanColumns(kind: OperationCycleKind) {
  const [collapsed, setCollapsed] = useState<Set<ReplenishmentStatus>>(() =>
    readCollapsed(kind),
  );

  const toggle = useCallback(
    (status: ReplenishmentStatus) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(status)) {
          next.delete(status);
        } else {
          next.add(status);
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
