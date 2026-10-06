"use client";

import { useCallback } from "react";
import { usePersistedJson } from "@/hooks/use-persisted-json";
import type { MarginBasis } from "@/lib/pricing/financial-margin";

const TARGET_MARGIN_STORAGE_KEY = "lucratividade-target-margin";
const MARGIN_BASIS_STORAGE_KEY = "lucratividade-margin-basis";
export const DEFAULT_TARGET_MARGIN_PERCENT = 6;
const DEFAULT_MARGIN_BASIS: MarginBasis = "contribution";

/**
 * Meta de margem (e sobre qual margem ela vale), lembrada por navegador.
 * `usePersistedJson` devolve o padrão no servidor — sem diferença na
 * hidratação.
 */
export function useTargetMargin() {
  const [storedTarget, setStoredTarget] = usePersistedJson<unknown>(
    TARGET_MARGIN_STORAGE_KEY,
    DEFAULT_TARGET_MARGIN_PERCENT,
  );
  const [storedBasis, setStoredBasis] = usePersistedJson<unknown>(
    MARGIN_BASIS_STORAGE_KEY,
    DEFAULT_MARGIN_BASIS,
  );

  const targetMarginPercent =
    typeof storedTarget === "number" &&
    Number.isFinite(storedTarget) &&
    storedTarget >= 0 &&
    storedTarget <= 100
      ? storedTarget
      : DEFAULT_TARGET_MARGIN_PERCENT;
  const marginBasis: MarginBasis =
    storedBasis === "afterAds" ? "afterAds" : DEFAULT_MARGIN_BASIS;

  const applyTarget = useCallback(
    (nextTarget: number, nextBasis: MarginBasis) => {
      setStoredTarget(nextTarget);
      setStoredBasis(nextBasis);
    },
    [setStoredTarget, setStoredBasis],
  );

  return { targetMarginPercent, marginBasis, applyTarget };
}
