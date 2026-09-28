import {
  HOME_DASHBOARD_COLUMN_COUNT,
  HOME_WIDGET_DEFINITIONS,
  type HomeWidgetDefinition,
} from "@/lib/home/dashboard/widget-registry";

/**
 * Preferências do dashboard da Home — **puro**: sem React, sem DOM, sem
 * fetch. É o contrato que o repositório grava (hoje em `localStorage`,
 * amanhã em banco) e a única fonte de verdade sobre o que é um layout
 * válido.
 *
 * Duas coisas moldam este módulo:
 *
 * 1. **Layout em colunas.** Cada card mora numa coluna e tem uma posição
 *    dentro dela. Todo card tem a mesma largura (nada de span), o que é o que
 *    mantém o arrasto previsível.
 * 2. **Versões nomeadas.** `views[]` guarda quantas a pessoa quiser;
 *    `defaultViewId` é a principal, a que abre o app. Qual versão está sendo
 *    olhada no momento **não** mora aqui — é estado de tela, porque trocar de
 *    versão é uma visita temporária, não uma mudança de configuração.
 *
 * Regra de ouro: **nunca confiar no que está gravado**. O registry muda entre
 * releases (widget entra, widget sai, coluna deixa de existir) e o
 * `localStorage` é editável à mão. Toda leitura passa por
 * `normalizeDashboardPreferences`, que preserva a customização válida e
 * descarta o resto sem nunca lançar.
 */

export const DASHBOARD_PREFERENCES_VERSION = 1;
export const DASHBOARD_PREFERENCES_STORAGE_KEY = "dashboard:v1";
export const DEFAULT_VIEW_ID = "default";
export const DEFAULT_VIEW_NAME = "Meu início";

/** Reexportado do registry, onde mora junto da classe do grid pra não
 * divergirem. */
export const DASHBOARD_COLUMN_COUNT = HOME_DASHBOARD_COLUMN_COUNT;

const MAX_SETTINGS_KEYS = 20;
const MAX_SETTINGS_STRING_LENGTH = 200;
const MAX_VIEW_NAME_LENGTH = 40;
export const MAX_DASHBOARD_VIEWS = 8;
const MAX_VIEWS = MAX_DASHBOARD_VIEWS;

export type DashboardWidgetSettings = Record<
  string,
  string | number | boolean
>;

export type DashboardWidgetPreference = {
  id: string;
  visible: boolean;
  /** 0..DASHBOARD_COLUMN_COUNT-1. Sempre 0 para widget de faixa (`banner`),
   * que não vive em coluna. */
  column: number;
  /** Posição **dentro da coluna**. Espelho numérico da posição no array; o
   * array é a fonte de verdade, o campo existe para uma futura tabela de uma
   * linha por widget. */
  order: number;
  settings?: DashboardWidgetSettings;
};

export type DashboardView = {
  id: string;
  name: string;
  widgets: DashboardWidgetPreference[];
};

export type DashboardPreferences = {
  version: typeof DASHBOARD_PREFERENCES_VERSION;
  /** A versão principal — a que abre o app. */
  defaultViewId: string;
  views: DashboardView[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function sanitizeViewName(raw: unknown): string {
  if (!isNonEmptyString(raw)) return DEFAULT_VIEW_NAME;
  return raw.trim().slice(0, MAX_VIEW_NAME_LENGTH);
}

/** Só primitivos, com teto de chaves e de tamanho de string. Sem isso o
 * `localStorage` cresce sem limite e `settings` poderia virar depósito de dado
 * de tenant. */
function normalizeSettings(raw: unknown): DashboardWidgetSettings | undefined {
  if (!isPlainObject(raw)) return undefined;
  const entries: [string, string | number | boolean][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (entries.length >= MAX_SETTINGS_KEYS) break;
    if (typeof value === "string") {
      entries.push([key, value.slice(0, MAX_SETTINGS_STRING_LENGTH)]);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      entries.push([key, value]);
    } else if (typeof value === "boolean") {
      entries.push([key, value]);
    }
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function clampColumn(raw: unknown, fallback: number): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  const rounded = Math.trunc(value);
  if (rounded < 0) return 0;
  if (rounded > DASHBOARD_COLUMN_COUNT - 1) return DASHBOARD_COLUMN_COUNT - 1;
  return rounded;
}

function definitionsSortedByDefaultOrder(
  definitions: readonly HomeWidgetDefinition[],
): HomeWidgetDefinition[] {
  return [...definitions].sort((a, b) => a.defaultOrder - b.defaultOrder);
}

function preferenceFromDefinition(
  definition: HomeWidgetDefinition,
): DashboardWidgetPreference {
  return {
    id: definition.id,
    visible: definition.defaultVisible,
    column: definition.layout === "banner" ? 0 : definition.defaultColumn,
    order: 0,
    settings: undefined,
  };
}

/**
 * Deixa o array em **forma canônica** e re-sequencia `order`: faixas primeiro,
 * depois a coluna 0, depois a 1 — preservando a ordem relativa dentro de cada
 * grupo (partição estável).
 *
 * Canonizar aqui, e não só no normalizador, é o que torna tudo idempotente: sem
 * isso o default saía intercalando colunas (na ordem de `defaultOrder`) e o
 * normalizador reagrupava, então `normalize(default) !== default`. E era
 * também o que fazia `moveWidgetToColumn` não reconhecer um movimento nulo,
 * porque comparava posição de array entre dois agrupamentos diferentes.
 */
function resequence(
  widgets: DashboardWidgetPreference[],
  definitions: readonly HomeWidgetDefinition[],
): DashboardWidgetPreference[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const bucketRank = (widget: DashboardWidgetPreference) =>
    byId.get(widget.id)?.layout === "banner" ? -1 : widget.column;

  const buckets = new Map<number, DashboardWidgetPreference[]>();
  for (const widget of widgets) {
    const rank = bucketRank(widget);
    const list = buckets.get(rank);
    if (list) list.push(widget);
    else buckets.set(rank, [widget]);
  }

  const out: DashboardWidgetPreference[] = [];
  for (const rank of [...buckets.keys()].sort((a, b) => a - b)) {
    const list = buckets.get(rank) ?? [];
    list.forEach((widget, order) => {
      const { settings, ...rest } = widget;
      out.push({ ...rest, order, ...(settings ? { settings } : {}) });
    });
  }
  return out;
}

export function buildDefaultDashboardPreferences(
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  return {
    version: DASHBOARD_PREFERENCES_VERSION,
    defaultViewId: DEFAULT_VIEW_ID,
    views: [
      {
        id: DEFAULT_VIEW_ID,
        name: DEFAULT_VIEW_NAME,
        widgets: resequence(
          definitionsSortedByDefaultOrder(definitions).map(
            preferenceFromDefinition,
          ),
          definitions,
        ),
      },
    ],
  };
}

function normalizeWidgets(
  raw: unknown,
  definitions: readonly HomeWidgetDefinition[],
): DashboardWidgetPreference[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const rawList = Array.isArray(raw) ? raw : [];

  // Descarta não-objetos, ids fora do registry e ids duplicados (mantém a
  // primeira ocorrência).
  const seen = new Set<string>();
  const kept: {
    pref: DashboardWidgetPreference;
    definition: HomeWidgetDefinition;
    rawOrder: number | null;
    index: number;
  }[] = [];

  rawList.forEach((entry, index) => {
    if (!isPlainObject(entry)) return;
    const id = entry.id;
    if (typeof id !== "string") return;
    const definition = byId.get(id);
    if (!definition || seen.has(id)) return;
    seen.add(id);

    // Valor inválido cai no default da definição; widget fixado é sempre
    // visível, mesmo que o storage diga o contrário.
    const visible = definition.pinned
      ? true
      : typeof entry.visible === "boolean"
        ? entry.visible
        : definition.defaultVisible;
    // Faixa não mora em coluna; card cai na coluna default quando o valor
    // gravado não serve (inclui o storage da versão anterior, que não tinha
    // `column` — tinha `size`, que agora é ignorado).
    const column =
      definition.layout === "banner"
        ? 0
        : clampColumn(entry.column, definition.defaultColumn);
    const settings = normalizeSettings(entry.settings);

    kept.push({
      pref: {
        id,
        visible,
        column,
        order: 0,
        ...(settings ? { settings } : {}),
      },
      definition,
      rawOrder:
        typeof entry.order === "number" && Number.isFinite(entry.order)
          ? entry.order
          : null,
      index,
    });
  });

  // Se TODOS têm `order` numérico, ele manda dentro de cada coluna (ordenação
  // estável, empate desfeito pela posição original). Senão o array manda. Isso
  // cobre `order` duplicado e `order` ausente na mesma regra.
  const allHaveOrder = kept.length > 0 && kept.every((k) => k.rawOrder !== null);
  const ordered = allHaveOrder
    ? [...kept].sort((a, b) => {
        if (a.pref.column !== b.pref.column) {
          return a.pref.column - b.pref.column;
        }
        const diff = (a.rawOrder ?? 0) - (b.rawOrder ?? 0);
        return diff !== 0 ? diff : a.index - b.index;
      })
    : kept;

  let widgets = ordered.map((k) => k.pref);

  // Widget novo no registry entra na POSIÇÃO DEFAULT da coluna dele, não no
  // fim — senão todo release empurra novidade pro rodapé, onde ninguém vê.
  const present = new Set(widgets.map((w) => w.id));
  const missing = definitionsSortedByDefaultOrder(definitions).filter(
    (d) => !present.has(d.id),
  );
  for (const definition of missing) {
    const pref = preferenceFromDefinition(definition);
    let insertAt = widgets.length;
    for (let i = 0; i < widgets.length; i += 1) {
      const current = byId.get(widgets[i].id);
      if (!current) continue;
      const sameBucket =
        definition.layout === "banner"
          ? current.layout === "banner"
          : current.layout !== "banner" && widgets[i].column === pref.column;
      if (sameBucket && current.defaultOrder > definition.defaultOrder) {
        insertAt = i;
        break;
      }
    }
    widgets.splice(insertAt, 0, pref);
  }

  // Faixas vão pra frente, na ordem do registry — um `localStorage` editado à
  // mão não consegue tirar a zona de atenção do topo.
  const bannerIds = new Set(
    definitions.filter((d) => d.layout === "banner").map((d) => d.id),
  );
  if (bannerIds.size > 0) {
    const banners = definitionsSortedByDefaultOrder(definitions)
      .filter((d) => bannerIds.has(d.id))
      .flatMap((d) => widgets.filter((w) => w.id === d.id));
    widgets = [...banners, ...widgets.filter((w) => !bannerIds.has(w.id))];
  }

  return resequence(widgets, definitions);
}

export function normalizeDashboardPreferences(
  raw: unknown,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  // Qualquer coisa estruturalmente errada volta pro default. A Home nunca pode
  // quebrar por causa de storage corrompido.
  if (!isPlainObject(raw)) return buildDefaultDashboardPreferences(definitions);
  if (raw.version !== DASHBOARD_PREFERENCES_VERSION) {
    return buildDefaultDashboardPreferences(definitions);
  }
  if (!Array.isArray(raw.views)) {
    return buildDefaultDashboardPreferences(definitions);
  }

  const views: DashboardView[] = [];
  const seenViewIds = new Set<string>();
  for (const rawView of raw.views) {
    if (views.length >= MAX_VIEWS) break;
    if (!isPlainObject(rawView)) continue;
    if (!isNonEmptyString(rawView.id)) continue;
    const id = rawView.id.trim();
    if (seenViewIds.has(id)) continue;
    seenViewIds.add(id);
    views.push({
      id,
      name: sanitizeViewName(rawView.name),
      widgets: normalizeWidgets(rawView.widgets, definitions),
    });
  }

  if (views.length === 0) return buildDefaultDashboardPreferences(definitions);

  // Migração do formato anterior: o campo chamava `activeViewId` (a última
  // vista aberta) e não havia conceito de principal. Aproveitar como principal
  // é lossless — só existia uma view. A versão **não** é bumpada de propósito:
  // versão desconhecida cai no default, o que jogaria fora a personalização de
  // todos os usuários.
  const storedDefault = isNonEmptyString(raw.defaultViewId)
    ? raw.defaultViewId.trim()
    : isNonEmptyString(raw.activeViewId)
      ? raw.activeViewId.trim()
      : null;
  const defaultViewId =
    storedDefault && views.some((view) => view.id === storedDefault)
      ? storedDefault
      : views[0].id;

  return { version: DASHBOARD_PREFERENCES_VERSION, defaultViewId, views };
}

/** A versão principal (a que abre o app). */
export function getDefaultView(prefs: DashboardPreferences): DashboardView {
  return (
    prefs.views.find((view) => view.id === prefs.defaultViewId) ?? prefs.views[0]
  );
}

/** A versão pedida, caindo na principal quando o id não existe (ex.: a versão
 * que estava aberta foi excluída em outra aba). */
export function getView(
  prefs: DashboardPreferences,
  viewId: string | null | undefined,
): DashboardView {
  if (!viewId) return getDefaultView(prefs);
  return prefs.views.find((view) => view.id === viewId) ?? getDefaultView(prefs);
}

export function visibleWidgetIds(
  prefs: DashboardPreferences,
  viewId?: string | null,
): string[] {
  return getView(prefs, viewId)
    .widgets.filter((widget) => widget.visible)
    .map((widget) => widget.id);
}

function mapView(
  prefs: DashboardPreferences,
  viewId: string,
  definitions: readonly HomeWidgetDefinition[],
  update: (widgets: DashboardWidgetPreference[]) => DashboardWidgetPreference[],
): DashboardPreferences {
  const target = getView(prefs, viewId);
  return {
    ...prefs,
    views: prefs.views.map((view) =>
      view.id === target.id
        ? { ...view, widgets: resequence(update(view.widgets), definitions) }
        : view,
    ),
  };
}

// ── Ações sobre widgets ─────────────────────────────────────────────────────
// Todas recebem `viewId` porque a versão em foco é estado de tela, não dado
// persistido.

export function setWidgetVisible(
  prefs: DashboardPreferences,
  viewId: string,
  id: string,
  visible: boolean,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const definition = definitions.find((d) => d.id === id);
  if (!definition || definition.pinned) return prefs;
  return mapView(prefs, viewId, definitions, (widgets) =>
    widgets.map((widget) =>
      widget.id === id ? { ...widget, visible } : widget,
    ),
  );
}

export function setWidgetSettings(
  prefs: DashboardPreferences,
  viewId: string,
  id: string,
  settings: DashboardWidgetSettings,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const normalized = normalizeSettings(settings);
  return mapView(prefs, viewId, definitions, (widgets) =>
    widgets.map((widget) =>
      widget.id === id
        ? {
            ...widget,
            ...(normalized ? { settings: normalized } : { settings: undefined }),
          }
        : widget,
    ),
  );
}

/**
 * Move um widget para uma coluna/posição — a função que o arrasto usa. Opera
 * sobre o array de widgets (não sobre as preferências inteiras) para o drag
 * poder montar um rascunho barato a cada `onDragOver`, sem tocar no storage.
 *
 * `toIndex` é a posição **dentro da coluna de destino**, contando só os cards
 * daquela coluna. Fora da faixa, entra no fim.
 */
export function moveWidgetToColumn(
  widgets: readonly DashboardWidgetPreference[],
  id: string,
  toColumn: number,
  toIndex: number,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardWidgetPreference[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const moving = widgets.find((w) => w.id === id);
  // No-op devolve o array por **identidade**, não uma cópia: é o que permite
  // `next === current` valer como "nada mudou" no `onDragOver` (evitando um
  // setState por movimento de ponteiro) e o que evita snapshot novo à toa no
  // `useSyncExternalStore`.
  if (!moving) return widgets as DashboardWidgetPreference[];
  // Faixa não participa do arrasto — mover seria desfeito na normalização.
  if (byId.get(id)?.layout === "banner") {
    return widgets as DashboardWidgetPreference[];
  }

  const column = clampColumn(toColumn, moving.column);
  const rest = widgets.filter((w) => w.id !== id);
  const target = { ...moving, column };

  // Posição de inserção no array completo: antes do n-ésimo card da coluna de
  // destino, ou no fim dela.
  const columnPositions: number[] = [];
  rest.forEach((widget, index) => {
    if (byId.get(widget.id)?.layout === "banner") return;
    if (widget.column === column) columnPositions.push(index);
  });

  const clampedIndex = Math.max(0, Math.min(toIndex, columnPositions.length));
  const insertAt =
    clampedIndex < columnPositions.length
      ? columnPositions[clampedIndex]
      : columnPositions.length > 0
        ? columnPositions[columnPositions.length - 1] + 1
        : rest.length;

  const next = [...rest];
  next.splice(insertAt, 0, target);
  const resequenced = resequence(next, definitions);

  // Mesma coluna e mesma posição: devolve a entrada original por identidade.
  const unchanged =
    resequenced.length === widgets.length &&
    resequenced.every(
      (widget, index) =>
        widget.id === widgets[index].id &&
        widget.column === widgets[index].column &&
        widget.order === widgets[index].order,
    );
  return unchanged ? (widgets as DashboardWidgetPreference[]) : resequenced;
}

/** Aplica um layout inteiro (o resultado de um arrasto) de uma vez. */
export function applyWidgetLayout(
  prefs: DashboardPreferences,
  viewId: string,
  widgets: readonly DashboardWidgetPreference[],
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const allowed = new Set(definitions.map((d) => d.id));
  const seen = new Set<string>();
  const incoming = widgets.filter((widget) => {
    if (!allowed.has(widget.id) || seen.has(widget.id)) return false;
    seen.add(widget.id);
    return true;
  });
  return mapView(prefs, viewId, definitions, (current) => [
    ...incoming,
    // Nada pode desaparecer por causa de uma lista parcial.
    ...current.filter((widget) => !seen.has(widget.id)),
  ]);
}

/** Move o widget uma posição dentro da própria coluna. */
export function moveWidget(
  prefs: DashboardPreferences,
  viewId: string,
  id: string,
  direction: "up" | "down",
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  if (byId.get(id)?.layout === "banner") return prefs;

  const view = getView(prefs, viewId);
  const target = view.widgets.find((w) => w.id === id);
  if (!target) return prefs;

  const inColumn = view.widgets.filter(
    (w) => byId.get(w.id)?.layout !== "banner" && w.column === target.column,
  );
  const index = inColumn.findIndex((w) => w.id === id);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || nextIndex < 0 || nextIndex >= inColumn.length) {
    return prefs;
  }

  return applyWidgetLayout(
    prefs,
    viewId,
    moveWidgetToColumn(view.widgets, id, target.column, nextIndex, definitions),
    definitions,
  );
}

/** Troca o widget de coluna, mantendo a posição relativa aproximada. */
export function moveWidgetSideways(
  prefs: DashboardPreferences,
  viewId: string,
  id: string,
  direction: "left" | "right",
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  if (byId.get(id)?.layout === "banner") return prefs;

  const view = getView(prefs, viewId);
  const target = view.widgets.find((w) => w.id === id);
  if (!target) return prefs;

  const nextColumn = target.column + (direction === "left" ? -1 : 1);
  if (nextColumn < 0 || nextColumn > DASHBOARD_COLUMN_COUNT - 1) return prefs;

  return applyWidgetLayout(
    prefs,
    viewId,
    moveWidgetToColumn(view.widgets, id, nextColumn, target.order, definitions),
    definitions,
  );
}

// ── Ações sobre versões ─────────────────────────────────────────────────────

function nextViewId(prefs: DashboardPreferences): string {
  const used = new Set(prefs.views.map((view) => view.id));
  for (let i = 1; i <= MAX_VIEWS + 1; i += 1) {
    const candidate = `view-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `view-${Date.now()}`;
}

/**
 * Cria uma versão. Com `copyFromViewId`, duplica os widgets daquela versão
 * (o caso comum: "quero a minha, parecida com esta"); sem, nasce no padrão.
 * Devolve as preferências inalteradas quando já bateu o teto de versões.
 */
export function createView(
  prefs: DashboardPreferences,
  options: { name: string; copyFromViewId?: string },
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): { preferences: DashboardPreferences; viewId: string | null } {
  if (prefs.views.length >= MAX_VIEWS) {
    return { preferences: prefs, viewId: null };
  }
  const id = nextViewId(prefs);
  const widgets = options.copyFromViewId
    ? getView(prefs, options.copyFromViewId).widgets.map((widget) => ({
        ...widget,
      }))
    : buildDefaultDashboardPreferences(definitions).views[0].widgets;

  return {
    preferences: {
      ...prefs,
      views: [
        ...prefs.views,
        { id, name: sanitizeViewName(options.name), widgets },
      ],
    },
    viewId: id,
  };
}

export function renameView(
  prefs: DashboardPreferences,
  viewId: string,
  name: string,
): DashboardPreferences {
  if (!prefs.views.some((view) => view.id === viewId)) return prefs;
  return {
    ...prefs,
    views: prefs.views.map((view) =>
      view.id === viewId ? { ...view, name: sanitizeViewName(name) } : view,
    ),
  };
}

/** Exclui uma versão. No-op se for a última — sempre existe pelo menos uma.
 * Se era a principal, a primeira que sobrar assume. */
export function deleteView(
  prefs: DashboardPreferences,
  viewId: string,
): DashboardPreferences {
  if (prefs.views.length <= 1) return prefs;
  if (!prefs.views.some((view) => view.id === viewId)) return prefs;
  const views = prefs.views.filter((view) => view.id !== viewId);
  return {
    ...prefs,
    views,
    defaultViewId:
      prefs.defaultViewId === viewId ? views[0].id : prefs.defaultViewId,
  };
}

export function setDefaultView(
  prefs: DashboardPreferences,
  viewId: string,
): DashboardPreferences {
  if (!prefs.views.some((view) => view.id === viewId)) return prefs;
  return { ...prefs, defaultViewId: viewId };
}

/** Volta uma versão ao layout padrão, preservando nome e id. */
export function resetView(
  prefs: DashboardPreferences,
  viewId: string,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  if (!prefs.views.some((view) => view.id === viewId)) return prefs;
  const fresh = buildDefaultDashboardPreferences(definitions).views[0].widgets;
  return {
    ...prefs,
    views: prefs.views.map((view) =>
      view.id === viewId ? { ...view, widgets: fresh.map((w) => ({ ...w })) } : view,
    ),
  };
}

export function resetDashboardPreferences(
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  return buildDefaultDashboardPreferences(definitions);
}
