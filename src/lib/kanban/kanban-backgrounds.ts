export type KanbanBackground = {
  id: string;
  label: string;
  /** CSS `background` (cor sólida ou gradiente) — vazio = sem cor (padrão do app). */
  value: string;
};

export const KANBAN_BACKGROUNDS: KanbanBackground[] = [
  { id: "default", label: "Padrão", value: "" },
  { id: "sky", label: "Azul", value: "#cfe3fb" },
  { id: "emerald", label: "Verde", value: "#cfeee0" },
  { id: "amber", label: "Âmbar", value: "#fae6bd" },
  { id: "rose", label: "Rosa", value: "#f9d3d8" },
  { id: "violet", label: "Violeta", value: "#dfd6f7" },
  { id: "slate", label: "Cinza", value: "#dde1ea" },
  { id: "sunset", label: "Pôr do sol", value: "linear-gradient(135deg, #fbd3ac, #f6b8c0)" },
  { id: "ocean", label: "Oceano", value: "linear-gradient(135deg, #a6e3d8, #a9c9f0)" },
  { id: "grape", label: "Uva", value: "linear-gradient(135deg, #d6c2f0, #f0c2dd)" },
];
