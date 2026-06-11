"use client";

import { useCallback, useEffect, useState } from "react";

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

export function usePersistedOpen(
  storageKey: string,
  defaultOpen = false,
): {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
} {
  const [open, setOpenState] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOpenState(readPersistedOpen(storageKey, defaultOpen));
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return;
      setOpenState(readPersistedOpen(storageKey, defaultOpen));
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultOpen, storageKey]);

  const persistOpen = useCallback(
    (value: boolean) => {
      setOpenState(value);
      try {
        localStorage.setItem(storageKey, value ? "true" : "false");
      } catch {
        // ignore quota / private mode
      }
    },
    [storageKey],
  );

  const setOpen = useCallback(
    (value: boolean) => {
      persistOpen(value);
    },
    [persistOpen],
  );

  const toggle = useCallback(() => {
    setOpenState((current) => {
      const next = !current;
      try {
        localStorage.setItem(storageKey, next ? "true" : "false");
      } catch {
        // ignore quota / private mode
      }
      return next;
    });
  }, [storageKey]);

  return {
    open: ready ? open : defaultOpen,
    setOpen,
    toggle,
  };
}
