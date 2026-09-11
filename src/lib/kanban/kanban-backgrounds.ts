export type KanbanBackgroundGroup = "solid" | "gradient" | "creative";

export type KanbanBackground = {
  id: string;
  label: string;
  /** CSS `background` (cor sólida, gradiente ou padrão) — vazio = sem cor (padrão do app). */
  value: string;
  group: KanbanBackgroundGroup;
};

export const KANBAN_BACKGROUND_GROUPS: {
  id: KanbanBackgroundGroup;
  label: string;
}[] = [
  { id: "solid", label: "Sólidas" },
  { id: "gradient", label: "Gradientes" },
  { id: "creative", label: "Criativas" },
];

export const KANBAN_BACKGROUNDS: KanbanBackground[] = [
  { id: "default", label: "Padrão", value: "", group: "solid" },
  { id: "sky", label: "Azul", value: "#cfe3fb", group: "solid" },
  { id: "navy", label: "Azul-acinzentado", value: "#c5d0e0", group: "solid" },
  { id: "teal", label: "Teal", value: "#c5e0e4", group: "solid" },
  { id: "mint", label: "Menta", value: "#cfe8e4", group: "solid" },
  { id: "emerald", label: "Verde", value: "#cfeee0", group: "solid" },
  { id: "sage", label: "Sálvia", value: "#d4e0d0", group: "solid" },
  { id: "sand", label: "Areia", value: "#ead9c4", group: "solid" },
  { id: "cream", label: "Creme", value: "#f0ead8", group: "solid" },
  { id: "amber", label: "Âmbar", value: "#fae6bd", group: "solid" },
  { id: "peach", label: "Pêssego", value: "#f3d4c4", group: "solid" },
  { id: "rose", label: "Rosa", value: "#f9d3d8", group: "solid" },
  { id: "blush", label: "Blush", value: "#edd8d4", group: "solid" },
  { id: "violet", label: "Violeta", value: "#dfd6f7", group: "solid" },
  { id: "lavender", label: "Lavanda", value: "#e4dce8", group: "solid" },
  { id: "slate", label: "Cinza", value: "#dde1ea", group: "solid" },
  { id: "fog", label: "Névoa", value: "#d4d8e0", group: "solid" },

  { id: "sunset", label: "Pôr do sol", value: "linear-gradient(135deg, #fbd3ac, #f6b8c0)", group: "gradient" },
  { id: "dawn", label: "Amanhecer", value: "linear-gradient(135deg, #f6d4b8, #e8c8e0)", group: "gradient" },
  { id: "honey", label: "Mel", value: "linear-gradient(135deg, #f0d8a8, #e8c8b0)", group: "gradient" },
  { id: "ocean", label: "Oceano", value: "linear-gradient(135deg, #a6e3d8, #a9c9f0)", group: "gradient" },
  { id: "lagoon", label: "Lagoa", value: "linear-gradient(135deg, #a8d8e0, #c8e0d0)", group: "gradient" },
  { id: "forest", label: "Floresta", value: "linear-gradient(135deg, #b8dcc8, #c8d4b0)", group: "gradient" },
  { id: "grape", label: "Uva", value: "linear-gradient(135deg, #d6c2f0, #f0c2dd)", group: "gradient" },
  { id: "twilight", label: "Entardecer", value: "linear-gradient(180deg, #b8c4e0, #d4c0d8)", group: "gradient" },
  { id: "horizon", label: "Horizonte", value: "linear-gradient(180deg, #b9cde8 0%, #e8ddd0 100%)", group: "gradient" },

  {
    id: "aurora",
    label: "Aurora",
    value: "linear-gradient(160deg, #b8ddd4 0%, #c4d4ec 50%, #dcc8e8 100%)",
    group: "creative",
  },
  {
    id: "mist",
    label: "Neblina",
    value: "radial-gradient(ellipse at top, #e8eef6 0%, #cfd6e0 100%)",
    group: "creative",
  },
  {
    id: "mesh",
    label: "Mesh",
    value:
      "radial-gradient(ellipse at 20% 0%, #f0d8d8 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, #d4dcec 0%, transparent 55%), #e8e4e8",
    group: "creative",
  },
  {
    id: "glow",
    label: "Brilho quente",
    value: "radial-gradient(ellipse at 50% 0%, #f4e4c8, #e0d4c0)",
    group: "creative",
  },
  {
    id: "dots",
    label: "Pontilhado",
    value: "radial-gradient(#c4ccd8 1px, transparent 1px) 0 0 / 18px 18px, #e6ebf2",
    group: "creative",
  },
  {
    id: "linen",
    label: "Linho",
    value:
      "repeating-linear-gradient(135deg, #ebe4d4 0px, #ebe4d4 10px, #e6dfcc 10px, #e6dfcc 11px)",
    group: "creative",
  },
  {
    id: "stripes",
    label: "Listras",
    value:
      "repeating-linear-gradient(-45deg, #dce4ee, #dce4ee 14px, #d4dce8 14px, #d4dce8 28px)",
    group: "creative",
  },
];
