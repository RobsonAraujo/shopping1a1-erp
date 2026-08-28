import { prisma } from "@/lib/db";
import {
  OPERATIONAL_SETTINGS_DEFAULTS,
  type OperationalSettingsValues,
} from "@/lib/operational-settings-defaults";

export {
  OPERATIONAL_SETTINGS_DEFAULTS,
  toPurchaseAnalysisValues,
  toStockPlanningValues,
  type OperationalSettingsValues,
} from "@/lib/operational-settings-defaults";

export async function loadOperationalSettings(
  organizationId: string,
): Promise<OperationalSettingsValues> {
  const row = await prisma.operationalSettings.findUnique({
    where: { organizationId },
  });

  return {
    salesAverageWindowDays:
      row?.salesAverageWindowDays ??
      OPERATIONAL_SETTINGS_DEFAULTS.salesAverageWindowDays,
    leadTimeDays: row?.leadTimeDays ?? OPERATIONAL_SETTINGS_DEFAULTS.leadTimeDays,
    activeStockBufferDays:
      row?.activeStockBufferDays ??
      OPERATIONAL_SETTINGS_DEFAULTS.activeStockBufferDays,
    targetCoverageBufferDays:
      row?.targetCoverageBufferDays ??
      OPERATIONAL_SETTINGS_DEFAULTS.targetCoverageBufferDays,
    rotationHighDailyAvg:
      row?.rotationHighDailyAvg ??
      OPERATIONAL_SETTINGS_DEFAULTS.rotationHighDailyAvg,
    rotationMediumDailyAvg:
      row?.rotationMediumDailyAvg ??
      OPERATIONAL_SETTINGS_DEFAULTS.rotationMediumDailyAvg,
    promotionExpiringSoonDays:
      row?.promotionExpiringSoonDays ??
      OPERATIONAL_SETTINGS_DEFAULTS.promotionExpiringSoonDays,
  };
}

export type OperationalSettingsUpdateInput =
  Partial<OperationalSettingsValues>;

export async function updateOperationalSettings(
  organizationId: string,
  input: OperationalSettingsUpdateInput,
): Promise<OperationalSettingsValues> {
  await prisma.operationalSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...input },
    update: input,
  });
  return loadOperationalSettings(organizationId);
}
