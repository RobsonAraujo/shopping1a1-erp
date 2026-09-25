import {
  HOME_WIDGET_DEFINITIONS,
  type HomeWidgetDefinition,
  type HomeWidgetSize,
} from "@/lib/home/dashboard/widget-registry";

/**
 * Preferências do dashboard da Home — **puro**: sem React, sem DOM, sem
 * fetch. É o contrato que o repositório grava (hoje em `localStorage`,
 * amanhã em banco) e a única fonte de verdade sobre o que é um layout
 * válido.
 *
 * `views[]` já existe na V1 com uma única view ("default"). Múltiplas views
 * depois não mexem no sistema de widgets — só em quem escolhe `activeViewId`.
 *
 * Regra central: **nunca confiar no que está gravado**. O registry muda entre
 * releases (widget entra, widget sai, tamanho deixa de ser suportado) e o
 * `localStorage` é editável à mão. Toda leitura passa por
 * `normalizeDashboardPreferences`, que preserva a customização válida e
 * descarta o resto sem nunca lançar.
 */

export const DASHBOARD_PREFERENCES_VERSION = 1;
export const DASHBOARD_PREFERENCES_STORAGE_KEY = "dashboard:v1";
export const DEFAULT_VIEW_ID = "default";
export const DEFAULT_VIEW_NAME = "Meu início";

const MAX_SETTINGS_KEYS = 20;
const MAX_SETTINGS_STRING_LENGTH = 200;

export type DashboardWidgetSettings = Record<
  string,
  string | number | boolean
>;

export type DashboardWidgetPreference = {
  id: string;
  visible: boolean;
  /** Espelho numérico da posição no array. O array é a fonte de verdade; o
   * campo existe pra uma futura tabela de uma linha por widget. */
  order: number;
  size: HomeWidgetSize;
  settings?: DashboardWidgetSettings;
};

export type DashboardView = {
  id: string;
  name: string;
  widgets: DashboardWidgetPreference[];
};

export type DashboardPreferences = {
  version: typeof DASHBOARD_PREFERENCES_VERSION;
  activeViewId: string;
  views: DashboardView[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Regra 7: `settings` só aceita primitivos, com teto de chaves e de tamanho
 * de string. Sem isso o `localStorage` cresce sem limite e `settings` poderia
 * virar depósito de dado de tenant. */
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
    order: 0,
    size: definition.defaultSize,
  };
}

/** Re-sequencia `order` a partir da posição final no array (regra 8). */
function resequence(
  widgets: DashboardWidgetPreference[],
): DashboardWidgetPreference[] {
  return widgets.map((widget, index) => ({ ...widget, order: index }));
}

export function buildDefaultDashboardPreferences(
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  return {
    version: DASHBOARD_PREFERENCES_VERSION,
    activeViewId: DEFAULT_VIEW_ID,
    views: [
      {
        id: DEFAULT_VIEW_ID,
        name: DEFAULT_VIEW_NAME,
        widgets: resequence(
          definitionsSortedByDefaultOrder(definitions).map(
            preferenceFromDefinition,
          ),
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

  // Regra 4: descarta não-objetos, ids fora do registry e ids duplicados
  // (mantém a primeira ocorrência).
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

    // Regras 5 e 6: valor inválido cai no default da definição; widget
    // fixado é sempre visível, mesmo que o storage diga o contrário.
    const visible = definition.pinned
      ? true
      : typeof entry.visible === "boolean"
        ? entry.visible
        : definition.defaultVisible;
    const size =
      typeof entry.size === "string" &&
      (definition.supportedSizes as readonly string[]).includes(entry.size)
        ? (entry.size as HomeWidgetSize)
        : definition.defaultSize;
    const settings = normalizeSettings(entry.settings);

    kept.push({
      pref: {
        id,
        visible,
        order: 0,
        size,
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

  // Regra 8: se TODOS têm `order` numérico, ele manda (ordenação estável,
  // empate desfeito pela posição original). Senão o array manda. Isso cobre
  // `order` duplicado e `order` ausente na mesma regra.
  const allHaveOrder = kept.length > 0 && kept.every((k) => k.rawOrder !== null);
  const ordered = allHaveOrder
    ? [...kept].sort((a, b) => {
        const diff = (a.rawOrder ?? 0) - (b.rawOrder ?? 0);
        return diff !== 0 ? diff : a.index - b.index;
      })
    : kept;

  let widgets = ordered.map((k) => k.pref);

  // Regra 9: widget novo no registry entra na POSIÇÃO DEFAULT, não no fim —
  // senão todo release empurra novidade pro rodapé, onde ninguém vê.
  const present = new Set(widgets.map((w) => w.id));
  const missing = definitionsSortedByDefaultOrder(definitions).filter(
    (d) => !present.has(d.id),
  );
  for (const definition of missing) {
    let insertAt = 0;
    for (let i = 0; i < widgets.length; i += 1) {
      const current = byId.get(widgets[i].id);
      if (current && current.defaultOrder < definition.defaultOrder) {
        insertAt = i + 1;
      }
    }
    widgets.splice(insertAt, 0, preferenceFromDefinition(definition));
  }

  // Regra 10: fixados vão pra frente, na ordem do registry — um
  // `localStorage` editado à mão não consegue tirar a zona de atenção do topo.
  const pinnedIds = new Set(
    definitions.filter((d) => d.pinned).map((d) => d.id),
  );
  if (pinnedIds.size > 0) {
    const pinned = definitionsSortedByDefaultOrder(definitions)
      .filter((d) => pinnedIds.has(d.id))
      .flatMap((d) => widgets.filter((w) => w.id === d.id));
    widgets = [...pinned, ...widgets.filter((w) => !pinnedIds.has(w.id))];
  }

  return resequence(widgets);
}

export function normalizeDashboardPreferences(
  raw: unknown,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  // Regras 1 e 2: qualquer coisa estruturalmente errada volta pro default.
  // A Home nunca pode quebrar por causa de storage corrompido.
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
    if (!isPlainObject(rawView)) continue;
    if (!isNonEmptyString(rawView.id)) continue;
    const id = rawView.id.trim();
    if (seenViewIds.has(id)) continue;
    seenViewIds.add(id);
    views.push({
      id,
      name: isNonEmptyString(rawView.name)
        ? rawView.name.trim()
        : DEFAULT_VIEW_NAME,
      widgets: normalizeWidgets(rawView.widgets, definitions),
    });
  }

  if (views.length === 0) return buildDefaultDashboardPreferences(definitions);

  // Regra 3: `activeViewId` que não existe cai na primeira view.
  const activeViewId =
    isNonEmptyString(raw.activeViewId) &&
    views.some((view) => view.id === raw.activeViewId)
      ? raw.activeViewId.trim()
      : views[0].id;

  return { version: DASHBOARD_PREFERENCES_VERSION, activeViewId, views };
}

export function getActiveView(prefs: DashboardPreferences): DashboardView {
  return (
    prefs.views.find((view) => view.id === prefs.activeViewId) ?? prefs.views[0]
  );
}

/** Ids visíveis, na ordem do usuário. */
export function visibleWidgetIds(prefs: DashboardPreferences): string[] {
  return getActiveView(prefs)
    .widgets.filter((widget) => widget.visible)
    .map((widget) => widget.id);
}

function mapActiveView(
  prefs: DashboardPreferences,
  update: (widgets: DashboardWidgetPreference[]) => DashboardWidgetPreference[],
): DashboardPreferences {
  const active = getActiveView(prefs);
  return {
    ...prefs,
    views: prefs.views.map((view) =>
      view.id === active.id
        ? { ...view, widgets: resequence(update(view.widgets)) }
        : view,
    ),
  };
}

export function setWidgetVisible(
  prefs: DashboardPreferences,
  id: string,
  visible: boolean,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const definition = definitions.find((d) => d.id === id);
  if (!definition || definition.pinned) return prefs;
  return mapActiveView(prefs, (widgets) =>
    widgets.map((widget) =>
      widget.id === id ? { ...widget, visible } : widget,
    ),
  );
}

export function setWidgetSize(
  prefs: DashboardPreferences,
  id: string,
  size: HomeWidgetSize,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const definition = definitions.find((d) => d.id === id);
  if (!definition) return prefs;
  if (!(definition.supportedSizes as readonly string[]).includes(size)) {
    return prefs;
  }
  return mapActiveView(prefs, (widgets) =>
    widgets.map((widget) => (widget.id === id ? { ...widget, size } : widget)),
  );
}

export function setWidgetSettings(
  prefs: DashboardPreferences,
  id: string,
  settings: DashboardWidgetSettings,
): DashboardPreferences {
  const normalized = normalizeSettings(settings);
  return mapActiveView(prefs, (widgets) =>
    widgets.map((widget) =>
      widget.id === id
        ? {
            ...widget,
            ...(normalized
              ? { settings: normalized }
              : { settings: undefined }),
          }
        : widget,
    ),
  );
}

/**
 * Move um widget uma posição. Só troca com um vizinho da mesma "zona"
 * (fixado ou não) — mover um item normal pra dentro da zona fixada seria
 * desfeito na próxima normalização, o que apareceria como botão que não faz
 * nada.
 */
export function moveWidget(
  prefs: DashboardPreferences,
  id: string,
  direction: "up" | "down",
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  const pinnedIds = new Set(
    definitions.filter((d) => d.pinned).map((d) => d.id),
  );
  if (pinnedIds.has(id)) return prefs;

  return mapActiveView(prefs, (widgets) => {
    const index = widgets.findIndex((widget) => widget.id === id);
    if (index === -1) return widgets;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= widgets.length) return widgets;
    if (pinnedIds.has(widgets[target].id)) return widgets;
    const next = [...widgets];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

/**
 * Aplica uma ordem completa (resultado de um drag). Ids desconhecidos são
 * ignorados e widgets não citados são mantidos no fim, na ordem atual — o
 * conjunto nunca encolhe por causa de uma lista parcial.
 */
export function reorderWidgets(
  prefs: DashboardPreferences,
  orderedIds: readonly string[],
): DashboardPreferences {
  return mapActiveView(prefs, (widgets) => {
    const byId = new Map(widgets.map((widget) => [widget.id, widget]));
    const seen = new Set<string>();
    const next: DashboardWidgetPreference[] = [];
    for (const id of orderedIds) {
      const widget = byId.get(id);
      if (!widget || seen.has(id)) continue;
      seen.add(id);
      next.push(widget);
    }
    for (const widget of widgets) {
      if (!seen.has(widget.id)) next.push(widget);
    }
    return next;
  });
}

export function resetDashboardPreferences(
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): DashboardPreferences {
  return buildDefaultDashboardPreferences(definitions);
}
