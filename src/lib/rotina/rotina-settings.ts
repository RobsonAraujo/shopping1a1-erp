import { prisma } from "@/lib/db/db";
import { decimalToNumber } from "@/lib/catalog-report/catalog-competition";
import { OPERATIONAL_SETTINGS_DEFAULTS } from "@/lib/configuracoes/operational-settings-defaults";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import {
  ROTINA_SETTINGS_DEFAULTS,
  normalizeDisabledRules,
  type RotinaSettings,
} from "@/lib/rotina/settings-shared";

/**
 * Metas da Rotina moram em `OperationalSettings` (uma linha por organização,
 * coluna nula = default de `src/config/rotina.ts`) — o mesmo lugar do prazo de
 * "promoção vencendo" e da janela de vendas, que a Rotina também usa.
 */
export async function loadRotinaSettings(
  organizationId: string,
): Promise<RotinaSettings> {
  const row = await prisma.operationalSettings.findUnique({
    where: { organizationId },
    select: {
      rotinaOwnMinMarginPercent: true,
      rotinaCatalogMinMarginPercent: true,
      rotinaOwnTacosTargetPercent: true,
      rotinaDisabledRules: true,
      promotionExpiringSoonDays: true,
      salesAverageWindowDays: true,
    },
  });

  const ownMin = decimalToNumber(row?.rotinaOwnMinMarginPercent);
  const catalogMin = decimalToNumber(row?.rotinaCatalogMinMarginPercent);
  const tacos = decimalToNumber(row?.rotinaOwnTacosTargetPercent);
  const disabledRules = normalizeDisabledRules(row?.rotinaDisabledRules);

  return {
    ownMinMarginPercent: ownMin ?? ROTINA_SETTINGS_DEFAULTS.ownMinMarginPercent,
    catalogMinMarginPercent:
      catalogMin ?? ROTINA_SETTINGS_DEFAULTS.catalogMinMarginPercent,
    ownTacosTargetPercent: tacos ?? ROTINA_SETTINGS_DEFAULTS.ownTacosTargetPercent,
    disabledRules,
    promotionExpiringSoonDays:
      row?.promotionExpiringSoonDays ??
      OPERATIONAL_SETTINGS_DEFAULTS.promotionExpiringSoonDays,
    salesAverageWindowDays:
      row?.salesAverageWindowDays ??
      OPERATIONAL_SETTINGS_DEFAULTS.salesAverageWindowDays,
    configured:
      ownMin !== null ||
      catalogMin !== null ||
      tacos !== null ||
      disabledRules.length > 0,
  };
}

export type RotinaSettingsUpdate = Partial<{
  ownMinMarginPercent: number;
  catalogMinMarginPercent: number;
  ownTacosTargetPercent: number;
  disabledRules: RotinaRuleKey[];
}>;

export async function updateRotinaSettings(
  organizationId: string,
  input: RotinaSettingsUpdate,
): Promise<RotinaSettings> {
  const data = {
    ...(input.ownMinMarginPercent !== undefined
      ? { rotinaOwnMinMarginPercent: input.ownMinMarginPercent }
      : {}),
    ...(input.catalogMinMarginPercent !== undefined
      ? { rotinaCatalogMinMarginPercent: input.catalogMinMarginPercent }
      : {}),
    ...(input.ownTacosTargetPercent !== undefined
      ? { rotinaOwnTacosTargetPercent: input.ownTacosTargetPercent }
      : {}),
    ...(input.disabledRules !== undefined
      ? { rotinaDisabledRules: normalizeDisabledRules(input.disabledRules) }
      : {}),
  };

  await prisma.operationalSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  return loadRotinaSettings(organizationId);
}
