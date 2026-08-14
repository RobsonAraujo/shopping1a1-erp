"use client";

import { usePersistedJson } from "@/hooks/use-persisted-json";
import { DEFAULT_SLOW_MOVER_THRESHOLD_DAYS } from "@/lib/insights/slow-movers";

export const SLOW_MOVER_THRESHOLD_STORAGE_KEY = "insights.slowMovers.threshold";

/** Threshold de cobertura (dias) do insight "Rotação baixa", persistido em localStorage. */
export function useSlowMoverThreshold() {
  return usePersistedJson(SLOW_MOVER_THRESHOLD_STORAGE_KEY, DEFAULT_SLOW_MOVER_THRESHOLD_DAYS);
}
