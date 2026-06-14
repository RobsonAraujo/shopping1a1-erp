"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export const DASHBOARD_ATTENTION_FULL_OPEN_KEY =
  "dashboard-attention-full-open";
export const DASHBOARD_ATTENTION_PURCHASE_OPEN_KEY =
  "dashboard-attention-purchase-open";

function readPersistedOpen(storageKey: string, defaultOpen: boolean): boolean {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return defaultOpen;
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return defaultOpen;
  } catch {
    return defaultOpen;
  }
}

function createPersistedOpenStore(storageKey: string, defaultOpen: boolean) {
  const listeners = new Set<() => void>();

  return {
    subscribe(onStoreChange: () => void) {
      listeners.add(onStoreChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== storageKey) return;
        onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot() {
      return readPersistedOpen(storageKey, defaultOpen);
    },
    getServerSnapshot() {
      return defaultOpen;
    },
    set(value: boolean) {
      try {
        localStorage.setItem(storageKey, value ? "true" : "false");
      } catch {
        // ignore quota / private mode
      }
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

const storeCache = new Map<
  string,
  ReturnType<typeof createPersistedOpenStore>
>();

function getPersistedOpenStore(storageKey: string, defaultOpen: boolean) {
  const cacheKey = `${storageKey}\0${defaultOpen}`;
  let store = storeCache.get(cacheKey);
  if (!store) {
    store = createPersistedOpenStore(storageKey, defaultOpen);
    storeCache.set(cacheKey, store);
  }
  return store;
}

export function usePersistedOpen(
  storageKey: string,
  defaultOpen = false,
): {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
} {
  const store = useMemo(
    () => getPersistedOpenStore(storageKey, defaultOpen),
    [storageKey, defaultOpen],
  );

  const open = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const setOpen = useCallback(
    (value: boolean) => {
      store.set(value);
    },
    [store],
  );

  const toggle = useCallback(() => {
    store.set(!store.getSnapshot());
  }, [store]);

  return {
    open,
    setOpen,
    toggle,
  };
}
