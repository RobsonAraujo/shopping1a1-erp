"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

function createJsonStore<T>(storageKey: string, defaultValue: T) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null = null;
  let cachedValue: T = defaultValue;

  function computeFromStorage(): T {
    let raw: string | null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      raw = null;
    }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (raw === null) {
      cachedValue = defaultValue;
    } else {
      try {
        cachedValue = JSON.parse(raw) as T;
      } catch {
        cachedValue = defaultValue;
      }
    }
    return cachedValue;
  }

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
      return computeFromStorage();
    },
    getServerSnapshot() {
      return defaultValue;
    },
    set(value: T) {
      cachedRaw = JSON.stringify(value);
      cachedValue = value;
      try {
        localStorage.setItem(storageKey, cachedRaw);
      } catch {
        // ignore quota / private mode
      }
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

const storeCache = new Map<string, ReturnType<typeof createJsonStore<unknown>>>();

function getJsonStore<T>(storageKey: string, defaultValue: T) {
  let store = storeCache.get(storageKey);
  if (!store) {
    store = createJsonStore(storageKey, defaultValue);
    storeCache.set(storageKey, store);
  }
  return store as ReturnType<typeof createJsonStore<T>>;
}

/**
 * Estado persistido em `localStorage` como JSON, sincronizado entre abas via
 * `useSyncExternalStore`. `defaultValue` deve ser um valor estável (definido
 * fora do componente) para não recriar a store a cada render.
 */
export function usePersistedJson<T>(
  storageKey: string,
  defaultValue: T,
): readonly [T, (value: T) => void] {
  const store = useMemo(
    () => getJsonStore(storageKey, defaultValue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );

  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const setValue = useCallback((next: T) => store.set(next), [store]);

  return [value, setValue] as const;
}
