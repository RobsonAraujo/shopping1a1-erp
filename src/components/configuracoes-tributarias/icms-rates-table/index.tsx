"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import type { IcmsRateRow } from "@/lib/tax-report/types";
import { IcmsRatesDesktop } from "./IcmsRatesDesktop";
import { IcmsRatesMobile } from "./IcmsRatesMobile";

export function IcmsRatesTable({
  rows,
  saving,
  onSave,
}: {
  rows: IcmsRateRow[];
  saving: boolean;
  onSave: (row: IcmsRateRow) => Promise<void>;
}) {
  const isMobile = useIsMobile();

  return isMobile ? (
    <IcmsRatesMobile rows={rows} saving={saving} onSave={onSave} />
  ) : (
    <IcmsRatesDesktop rows={rows} saving={saving} onSave={onSave} />
  );
}
