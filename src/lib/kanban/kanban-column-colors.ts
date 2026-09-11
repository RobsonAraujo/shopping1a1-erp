import type { CSSProperties } from "react";

export type KanbanColumnColorMode = "stripe" | "header" | "wash";

export type KanbanColumnColor = {
  id: string;
  label: string;
  accent: string;
  header: string;
  wash: string;
};

/** Cores de coluna pensadas como fundo: saturadas o bastante pra distinguir
 * a etapa, claras o bastante pra não brigar com o card. */
export const KANBAN_COLUMN_COLORS: KanbanColumnColor[] = [
  { id: "sky", label: "Azul", accent: "#5b9bd5", header: "#d7e8f7", wash: "#eaf3fb" },
  { id: "cyan", label: "Ciano", accent: "#4db6c4", header: "#d4eef1", wash: "#e7f6f8" },
  { id: "teal", label: "Teal", accent: "#4caf9a", header: "#d4eee6", wash: "#e6f5f0" },
  { id: "emerald", label: "Verde", accent: "#5eac6e", header: "#d8efdc", wash: "#e8f6ea" },
  { id: "lime", label: "Lima", accent: "#8fb84f", header: "#e6f0d4", wash: "#f1f6e6" },
  { id: "amber", label: "Âmbar", accent: "#e0a54b", header: "#f6e6c8", wash: "#faf0dc" },
  { id: "orange", label: "Laranja", accent: "#e0895c", header: "#f6ddd0", wash: "#faece4" },
  { id: "rose", label: "Rosa", accent: "#d96b7a", header: "#f6d6dc", wash: "#fae8eb" },
  { id: "pink", label: "Pink", accent: "#d46b9c", header: "#f4d6e6", wash: "#f9e8f1" },
  { id: "violet", label: "Violeta", accent: "#8f7cc4", header: "#e4dcf4", wash: "#f0ebf8" },
  { id: "indigo", label: "Índigo", accent: "#6d7ec8", header: "#d9def4", wash: "#eaedf8" },
  { id: "slate", label: "Cinza", accent: "#7a8896", header: "#dde2e8", wash: "#eceff2" },
];

/** Azul → verde: leitura de “começo → pronto” nas colunas da esquerda pra direita. */
export const KANBAN_STAGE_RAMP = [
  "sky",
  "cyan",
  "violet",
  "amber",
  "orange",
  "emerald",
] as const;

export type KanbanColumnTheme = "default" | "solid" | "colorful";

export type KanbanAppearance = {
  theme: KanbanColumnTheme;
  /** Cor única quando `theme === "solid"`. */
  solidColor: string;
  columnColors: Record<string, string>;
  colorMode: KanbanColumnColorMode;
};

export const DEFAULT_KANBAN_APPEARANCE: KanbanAppearance = {
  theme: "default",
  solidColor: "sky",
  columnColors: {},
  colorMode: "header",
};

export const KANBAN_COLUMN_THEMES: {
  id: KanbanColumnTheme;
  label: string;
  hint: string;
}[] = [
  { id: "default", label: "Padrão", hint: "Sem cor" },
  { id: "solid", label: "Uma cor", hint: "Todas iguais" },
  { id: "colorful", label: "Colorida", hint: "Uma por etapa" },
];

export const KANBAN_COLOR_MODES: { id: KanbanColumnColorMode; label: string }[] = [
  { id: "stripe", label: "Faixa" },
  { id: "header", label: "Cabeçalho" },
  { id: "wash", label: "Coluna" },
];

export function kanbanAppearanceStorageKey(kind: string) {
  return `kanban.appearance.${kind}`;
}

export function getKanbanColumnColor(id: string | undefined) {
  if (!id) return undefined;
  return KANBAN_COLUMN_COLORS.find((color) => color.id === id);
}

function inferTheme(
  value: Partial<KanbanAppearance> | null | undefined,
): KanbanColumnTheme {
  if (value?.theme === "default" || value?.theme === "solid" || value?.theme === "colorful") {
    return value.theme;
  }
  const colors = Object.values(value?.columnColors ?? {});
  const unique = new Set(colors);
  if (unique.size === 0) return "default";
  if (unique.size === 1) return "solid";
  return "colorful";
}

export function normalizeKanbanAppearance(
  value: Partial<KanbanAppearance> | null | undefined,
): KanbanAppearance {
  const colorMode = value?.colorMode;
  const theme = inferTheme(value);
  const colors = Object.values(value?.columnColors ?? {});
  const unique = [...new Set(colors)];
  return {
    theme,
    solidColor: value?.solidColor || unique[0] || "sky",
    columnColors: value?.columnColors ?? {},
    colorMode:
      colorMode === "header" || colorMode === "wash" || colorMode === "stripe"
        ? colorMode
        : "header",
  };
}

export function columnColorIdFor(
  appearance: KanbanAppearance,
  columnId: string,
  columnIds: string[],
): string | undefined {
  if (appearance.theme === "default") return undefined;
  if (appearance.theme === "solid") return appearance.solidColor;
  return appearance.columnColors[columnId] ?? paintColumnsByStage(columnIds)[columnId];
}

export function paintColumnsByStage(columnIds: string[]): Record<string, string> {
  if (columnIds.length === 0) return {};
  const last = KANBAN_STAGE_RAMP.length - 1;
  const next: Record<string, string> = {};
  columnIds.forEach((id, index) => {
    const t = columnIds.length === 1 ? 0 : index / (columnIds.length - 1);
    next[id] = KANBAN_STAGE_RAMP[Math.round(t * last)];
  });
  return next;
}

export function resolveKanbanColumnPaint(
  colorId: string | undefined,
  mode: KanbanColumnColorMode,
): {
  stripe?: string;
  shellStyle?: CSSProperties;
  headerStyle?: CSSProperties;
} {
  const color = getKanbanColumnColor(colorId);
  if (!color) return {};
  if (mode === "stripe") return { stripe: color.accent };
  if (mode === "header") return { headerStyle: { background: color.header } };
  return {
    shellStyle: { background: color.wash, borderColor: `${color.accent}66` },
    headerStyle: { background: color.header },
  };
}
