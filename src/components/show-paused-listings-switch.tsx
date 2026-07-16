"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ShowPausedListingsSwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  pausedCount?: number;
  className?: string;
  disabled?: boolean;
};

export function ShowPausedListingsSwitch({
  checked,
  onCheckedChange,
  pausedCount,
  className,
  disabled,
}: ShowPausedListingsSwitchProps) {
  const id = useId();
  const countLabel =
    pausedCount !== undefined && pausedCount > 0
      ? ` (${pausedCount})`
      : "";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2",
        className,
      )}
    >
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label="Mostrar anúncios pausados"
      />
      <label
        htmlFor={id}
        className="cursor-pointer text-sm text-[var(--foreground)]"
      >
        Mostrar pausados{countLabel}
      </label>
    </div>
  );
}

/** Default: hide paused. Missing/unknown status treated as active. */
export function isPausedListingStatus(status: string | null | undefined): boolean {
  return status === "paused";
}

export function filterListingsByPausedVisibility<T>(
  items: T[],
  showPaused: boolean,
  getStatus: (item: T) => string | null | undefined,
): T[] {
  if (showPaused) return items;
  return items.filter((item) => !isPausedListingStatus(getStatus(item)));
}

export function countPausedListings<T>(
  items: T[],
  getStatus: (item: T) => string | null | undefined,
): number {
  return items.filter((item) => isPausedListingStatus(getStatus(item))).length;
}
