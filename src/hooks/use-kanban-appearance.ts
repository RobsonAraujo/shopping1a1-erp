"use client";

import { useCallback } from "react";
import type { OperationCycleKind } from "@/generated/prisma/client";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import {
  DEFAULT_KANBAN_APPEARANCE,
  kanbanAppearanceStorageKey,
  normalizeKanbanAppearance,
  type KanbanAppearance,
  type KanbanColumnColorMode,
  type KanbanColumnTheme,
} from "@/lib/kanban/kanban-column-colors";

export function useKanbanAppearance(kind: OperationCycleKind) {
  const [stored, setStored] = usePersistedJson(
    kanbanAppearanceStorageKey(kind),
    DEFAULT_KANBAN_APPEARANCE,
  );
  const appearance = normalizeKanbanAppearance(stored);

  const setAppearance = useCallback(
    (next: KanbanAppearance) => {
      setStored(normalizeKanbanAppearance(next));
    },
    [setStored],
  );

  const setTheme = useCallback(
    (theme: KanbanColumnTheme) => {
      setAppearance({
        ...appearance,
        theme,
        columnColors: theme === "colorful" ? {} : appearance.columnColors,
      });
    },
    [appearance, setAppearance],
  );

  const setSolidColor = useCallback(
    (solidColor: string) => {
      setAppearance({ ...appearance, theme: "solid", solidColor });
    },
    [appearance, setAppearance],
  );

  const setColumnColor = useCallback(
    (columnId: string, colorId: string) => {
      if (appearance.theme === "solid") {
        setAppearance({
          ...appearance,
          solidColor: colorId || appearance.solidColor,
          theme: colorId ? "solid" : "default",
        });
        return;
      }
      const columnColors = { ...appearance.columnColors };
      if (!colorId) delete columnColors[columnId];
      else columnColors[columnId] = colorId;
      setAppearance({ ...appearance, theme: "colorful", columnColors });
    },
    [appearance, setAppearance],
  );

  const setColorMode = useCallback(
    (colorMode: KanbanColumnColorMode) => {
      setAppearance({ ...appearance, colorMode });
    },
    [appearance, setAppearance],
  );

  return { appearance, setTheme, setSolidColor, setColumnColor, setColorMode };
}
