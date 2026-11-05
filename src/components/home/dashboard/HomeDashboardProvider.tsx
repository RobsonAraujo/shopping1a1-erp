"use client";

import {
  createContext,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  getDefaultView,
  getView,
  visibleWidgetIds,
  type DashboardPreferences,
  type DashboardView,
  type DashboardWidgetPreference,
} from "@/lib/home/dashboard/dashboard-preferences";
import type { DashboardPreferencesRepository } from "@/lib/home/dashboard/dashboard-preferences-repository";
import {
  createServerDashboardPreferences,
  type ServerDashboardRepository,
} from "@/lib/home/dashboard/dashboard-preferences-server-repository";
import { importLocalDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-import";
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
 * - `CoreContext`: o snapshot do servidor. Chega por stream como promise (a
 *   página não espera por ele) e **nunca muda** depois de resolvido.
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
  /** A versão sendo olhada agora. Estado de tela, não dado persistido: trocar
   * de versão é visita temporária e o próximo acesso volta na principal. */
  activeViewId: string;
  setActiveViewId: (viewId: string) => void;
  view: DashboardView;
  widgets: DashboardWidgetPreference[];
  visibleIds: string[];
  repository: DashboardPreferencesRepository;
  update: (
    next: DashboardPreferences | ((current: DashboardPreferences) => DashboardPreferences),
  ) => void;
};

type DataContextValue = {
  slices: Partial<{ [K in HomeWidgetDataKey]: HomeWidgetDataResult<K> }>;
  loadingKeys: ReadonlySet<HomeWidgetDataKey>;
  error: string | null;
  reload: (keys?: readonly HomeWidgetDataKey[]) => void;
};

type HomeCoreSource = HomeCoreSnapshot | Promise<HomeCoreSnapshot>;

function isCorePromise(core: HomeCoreSource): core is Promise<HomeCoreSnapshot> {
  return typeof (core as Promise<HomeCoreSnapshot>).then === "function";
}

/** Referência estável: enquanto o snapshot não chega, nenhuma chave é pedida. */
const NO_DATA_KEYS: readonly HomeWidgetDataKey[] = [];

const CoreContext = createContext<HomeCoreSource | null>(null);
const SellerCardContext = createContext<ReactNode>(null);
const LayoutContext = createContext<LayoutContextValue | null>(null);
const DataContext = createContext<DataContextValue | null>(null);

export function HomeDashboardProvider({
  core,
  sellerCard = null,
  layout,
  viewId,
  repository,
  children,
}: {
  /** A página entrega a promise, para não esperar o snapshot antes do primeiro
   * byte. Objeto pronto também vale (testes). */
  core: HomeCoreSource;
  /** Card de Vendas renderizado no servidor (dentro de `<Suspense>`), para o
   * `fetchMe` streamar em vez de bloquear a página. */
  sellerCard?: ReactNode;
  /** As versões lidas do banco no servidor. */
  layout?: { views: DashboardView[]; revision: number };
  /** Cookie `home-view`, lido no servidor: qual versão abre neste navegador. */
  viewId?: string | null;
  /** Injetável para teste; em produção é o que fala com o banco. */
  repository?: DashboardPreferencesRepository;
  children: ReactNode;
}) {
  // Criado **uma vez**: o repositório guarda estado (revisão confirmada, escrita
  // pendente) que não pode ser jogado fora a cada render do provider.
  const [repo] = useState<DashboardPreferencesRepository>(
    () =>
      repository ??
      createServerDashboardPreferences(
        {
          views: layout?.views ?? [],
          revision: layout?.revision ?? 0,
          viewId,
        },
        { onError: (message) => toast.error(message) },
      ),
  );

  /**
   * As versões vêm do banco, e o cookie diz qual abre — então o servidor já
   * monta o layout **certo** e o `getServerSnapshot` pode ser a mesma leitura do
   * client. Era aqui que morava a limitação do `localStorage`: o HTML só podia
   * conter o layout padrão, e quem tinha personalizado via a Home trocar de cara
   * depois da hidratação.
   */
  const preferences = useSyncExternalStore(repo.subscribe, repo.read, repo.read);

  /**
   * Importa uma vez o layout que ficou no `localStorage` da época em que as
   * versões não iam pro banco. Fora do render porque escreve (cookie + PUT).
   */
  useEffect(() => {
    if ("revision" in repo) {
      importLocalDashboardPreferences(repo as ServerDashboardRepository);
    }
  }, [repo]);

  // Começa na principal. `getView` cai na principal sozinho se a versão em foco
  // deixar de existir (ex.: excluída em outra aba), então não precisa de effect
  // de sincronização.
  const [activeViewId, setActiveViewId] = useState(
    () => getDefaultView(preferences).id,
  );
  const view = getView(preferences, activeViewId);

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

  const widgets = view.widgets;
  const visibleIds = useMemo(
    () => visibleWidgetIds(preferences, view.id),
    [preferences, view.id],
  );

  // O batch só sai depois do snapshot. Com a página sem esperar por ele, o client
  // hidrata antes de as queries terminarem, e o batch disputaria o mesmo pool de
  // conexões. Mantém a ordem de carga que a Home sempre teve; os cards do batch
  // ficam em "carregando" nesse intervalo.
  const [coreReady, setCoreReady] = useState(() => !isCorePromise(core));
  useEffect(() => {
    if (!isCorePromise(core)) return;
    let active = true;
    const markReady = () => {
      if (active) setCoreReady(true);
    };
    void core.then(markReady, markReady);
    return () => {
      active = false;
    };
  }, [core]);

  // Só as chaves dos widgets VISÍVEIS: widget escondido não gera request.
  const dataKeys = useMemo(
    () => (coreReady ? homeWidgetDataKeysFor(visibleIds) : NO_DATA_KEYS),
    [coreReady, visibleIds],
  );
  const widgetData = useHomeWidgetData(dataKeys);

  const layoutValue = useMemo<LayoutContextValue>(
    () => ({
      preferences,
      activeViewId: view.id,
      setActiveViewId,
      view,
      widgets,
      visibleIds,
      repository: repo,
      update,
    }),
    [preferences, view, widgets, visibleIds, repo, update],
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

/**
 * Suspende até o snapshot chegar: quem chama precisa estar dentro de um
 * `<Suspense>`, que é o que `HomeWidgetRenderer` põe em volta dos widgets `core`.
 */
export function useHomeCore(): HomeCoreSnapshot {
  const core = useContext(CoreContext);
  if (!core) {
    throw new Error("useHomeCore precisa estar dentro de HomeDashboardProvider");
  }
  return isCorePromise(core) ? use(core) : core;
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
