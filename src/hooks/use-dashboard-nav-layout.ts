"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  DASHBOARD_NAV_LAYOUT_STORAGE_KEY,
  DEFAULT_DASHBOARD_NAV_LAYOUT,
  type DashboardNavLayout,
} from "@/lib/dashboard-nav";

function readLayout(): DashboardNavLayout {
  try {
    const raw = localStorage.getItem(DASHBOARD_NAV_LAYOUT_STORAGE_KEY);
    if (raw === "flat" || raw === "categorized") return raw;
    return DEFAULT_DASHBOARD_NAV_LAYOUT;
  } catch {
    return DEFAULT_DASHBOARD_NAV_LAYOUT;
  }
}

function createLayoutStore() {
  const listeners = new Set<() => void>();

  return {
    subscribe(onStoreChange: () => void) {
      listeners.add(onStoreChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== DASHBOARD_NAV_LAYOUT_STORAGE_KEY) {
          return;
        }
        onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot(): DashboardNavLayout {
      return readLayout();
    },
    getServerSnapshot(): DashboardNavLayout {
      return DEFAULT_DASHBOARD_NAV_LAYOUT;
    },
    set(value: DashboardNavLayout) {
      try {
        localStorage.setItem(DASHBOARD_NAV_LAYOUT_STORAGE_KEY, value);
      } catch {
        // ignore
      }
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

const layoutStore = createLayoutStore();

export function useDashboardNavLayout(): {
  layout: DashboardNavLayout;
  setLayout: (value: DashboardNavLayout) => void;
  toggleLayout: () => void;
} {
  const layout = useSyncExternalStore(
    layoutStore.subscribe,
    layoutStore.getSnapshot,
    layoutStore.getServerSnapshot,
  );

  const setLayout = useCallback((value: DashboardNavLayout) => {
    layoutStore.set(value);
  }, []);

  const toggleLayout = useCallback(() => {
    layoutStore.set(layout === "categorized" ? "flat" : "categorized");
  }, [layout]);

  return useMemo(
    () => ({ layout, setLayout, toggleLayout }),
    [layout, setLayout, toggleLayout],
  );
}
