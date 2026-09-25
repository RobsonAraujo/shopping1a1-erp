"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  buildDefaultDashboardPreferences,
  getActiveView,
  visibleWidgetIds,
  type DashboardPreferences,
  type DashboardWidgetPreference,
} from "@/lib/home/dashboard/dashboard-preferences";
import {
  createLocalStorageDashboardPreferences,
  type DashboardPreferencesRepository,
} from "@/lib/home/dashboard/dashboard-preferences-repository";
import { homeWidgetDataKeysFor } from "@/lib/home/dashboard/widget-registry";
import type { HomeCoreSnapshot } from "@/lib/home/dashboard/home-core-types";
import type {
  HomeWidgetDataKey,
  HomeWidgetDataResult,
} from "@/lib/home/dashboard/widget-data-keys";
import { useHomeWidgetData } from "@/hooks/use-home-widget-data";

/**
 * Três contextos separados, e isso é a decisão de performance central da
 * Home.
 *
 * - `CoreContext`: o snapshot do servidor. Criado uma vez, **nunca muda**.
 * - `DataContext`: as slices do batch. Muda quando um fetch resolve.
 * - `LayoutContext`: as preferências. Muda ao personalizar.
 *
 * O *corpo* de cada widget consome Core/Data; só o *slot* consome Layout.
 * Combinado com key estável + `memo` no renderer, reordenar move a instância
 * do widget em vez de desmontá-la: nenhum effect roda de novo, nenhum fetch se
 * repete, e o estado interno (nota meio digitada, timer rodando) sobrevive.
 * Se o layout estivesse num contexto único junto com os dados, cada arrasto
 * re-renderizaria todos os widgets.
 */

type LayoutContextValue = {
  preferences: DashboardPreferences;
  widgets: DashboardWidgetPreference[];
  visibleIds: string[];
  repository: DashboardPreferencesRepository;
  update: (
    next: DashboardPreferences | ((current: DashboardPreferences) => DashboardPreferences),
  ) => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
};

type DataContextValue = {
  slices: Partial<{ [K in HomeWidgetDataKey]: HomeWidgetDataResult<K> }>;
  loadingKeys: ReadonlySet<HomeWidgetDataKey>;
  error: string | null;
  reload: (keys?: readonly HomeWidgetDataKey[]) => void;
};

const CoreContext = createContext<HomeCoreSnapshot | null>(null);
const SellerCardContext = createContext<ReactNode>(null);
const LayoutContext = createContext<LayoutContextValue | null>(null);
const DataContext = createContext<DataContextValue | null>(null);

const DEFAULT_PREFERENCES = buildDefaultDashboardPreferences();

export function HomeDashboardProvider({
  core,
  sellerCard = null,
  repository,
  children,
}: {
  core: HomeCoreSnapshot;
  /** Card de Vendas renderizado no servidor (dentro de `<Suspense>`), para o
   * `fetchMe` streamar em vez de bloquear a página. */
  sellerCard?: ReactNode;
  /** Injetável para teste; em produção é o de `localStorage`. */
  repository?: DashboardPreferencesRepository;
  children: ReactNode;
}) {
  const repo = useMemo(
    () => repository ?? createLocalStorageDashboardPreferences(),
    [repository],
  );

  /**
   * As preferências vivem no `localStorage`, então o HTML do servidor só pode
   * conter o layout default — renderizar o layout do usuário já no primeiro
   * render do client daria mismatch de hidratação em todo load de quem
   * personalizou.
   *
   * É exatamente o que `useSyncExternalStore` resolve: o `getServerSnapshot`
   * (3º argumento) vale no servidor **e** na hidratação, e só depois o React
   * troca para o `getSnapshot` real. Nada de `useState` + `useEffect` para
   * detectar o mount à mão.
   */
  const preferences = useSyncExternalStore(
    repo.subscribe,
    repo.read,
    () => DEFAULT_PREFERENCES,
  );

  const [editing, setEditing] = useState(false);

  const update = useCallback(
    (
      next:
        | DashboardPreferences
        | ((current: DashboardPreferences) => DashboardPreferences),
    ) => {
      const value =
        typeof next === "function" ? next(repo.read()) : next;
      repo.write(value);
    },
    [repo],
  );

  const widgets = getActiveView(preferences).widgets;
  const visibleIds = useMemo(
    () => visibleWidgetIds(preferences),
    [preferences],
  );

  // Só as chaves dos widgets VISÍVEIS: widget escondido não gera request.
  const dataKeys = useMemo(
    () => homeWidgetDataKeysFor(visibleIds),
    [visibleIds],
  );
  const widgetData = useHomeWidgetData(dataKeys);

  const layoutValue = useMemo<LayoutContextValue>(
    () => ({
      preferences,
      widgets,
      visibleIds,
      repository: repo,
      update,
      editing,
      setEditing,
    }),
    [preferences, widgets, visibleIds, repo, update, editing],
  );

  const dataValue = useMemo<DataContextValue>(
    () => ({
      slices: widgetData.slices,
      loadingKeys: widgetData.loadingKeys,
      error: widgetData.error,
      reload: widgetData.reload,
    }),
    [
      widgetData.slices,
      widgetData.loadingKeys,
      widgetData.error,
      widgetData.reload,
    ],
  );

  return (
    <CoreContext.Provider value={core}>
      <SellerCardContext.Provider value={sellerCard}>
        <DataContext.Provider value={dataValue}>
          <LayoutContext.Provider value={layoutValue}>
            {children}
          </LayoutContext.Provider>
        </DataContext.Provider>
      </SellerCardContext.Provider>
    </CoreContext.Provider>
  );
}

export function useHomeCore(): HomeCoreSnapshot {
  const core = useContext(CoreContext);
  if (!core) {
    throw new Error("useHomeCore precisa estar dentro de HomeDashboardProvider");
  }
  return core;
}

export function useHomeSellerCard(): ReactNode {
  return useContext(SellerCardContext);
}

export function useHomeLayout(): LayoutContextValue {
  const layout = useContext(LayoutContext);
  if (!layout) {
    throw new Error("useHomeLayout precisa estar dentro de HomeDashboardProvider");
  }
  return layout;
}

export function useHomeWidgetDataContext(): DataContextValue {
  const data = useContext(DataContext);
  if (!data) {
    throw new Error(
      "useHomeWidgetDataContext precisa estar dentro de HomeDashboardProvider",
    );
  }
  return data;
}

/** Slice de batch de um widget, com o estado de carregamento já resolvido. */
export function useHomeWidgetSlice<K extends HomeWidgetDataKey>(
  key: K,
): {
  value: Extract<HomeWidgetDataResult<K>, { ok: true }>["value"] | null;
  loading: boolean;
  error: string | null;
} {
  const { slices, loadingKeys, error } = useHomeWidgetDataContext();
  const result = slices[key];
  if (result?.ok) return { value: result.value, loading: false, error: null };
  if (result) return { value: null, loading: false, error: result.error };
  return {
    value: null,
    loading: loadingKeys.has(key) || !error,
    error,
  };
}
