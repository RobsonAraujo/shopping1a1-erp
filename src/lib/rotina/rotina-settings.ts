import { prisma } from "@/lib/db/db";
import { decimalToNumber } from "@/lib/catalog-report/catalog-competition";
import { OPERATIONAL_SETTINGS_DEFAULTS } from "@/lib/configuracoes/operational-settings-defaults";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import {
  ROTINA_SETTINGS_DEFAULTS,
  isRotinaSalesWindowDays,
  normalizeDisabledRules,
  type RotinaSalesWindowDays,
  type RotinaSettings,
} from "@/lib/rotina/settings-shared";

/**
 * Metas da Rotina moram em `OperationalSettings` (uma linha por organização,
 * coluna nula = default de `src/config/rotina.ts`) — o mesmo lugar do prazo de
 * "promoção vencendo", que a Rotina também usa. A janela de vendas é a própria
 * da Rotina (`rotinaSalesWindowDays`), não a de Planejamento.
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
      rotinaCatalogRaiseCushionPercent: true,
      rotinaCatalogRaiseMinPercent: true,
      rotinaDisabledRules: true,
      rotinaSalesWindowDays: true,
      promotionExpiringSoonDays: true,
    },
  });

  const ownMin = decimalToNumber(row?.rotinaOwnMinMarginPercent);
  const catalogMin = decimalToNumber(row?.rotinaCatalogMinMarginPercent);
  const tacos = decimalToNumber(row?.rotinaOwnTacosTargetPercent);
  const raiseCushion = decimalToNumber(row?.rotinaCatalogRaiseCushionPercent);
  const raiseMin = decimalToNumber(row?.rotinaCatalogRaiseMinPercent);
  const disabledRules = normalizeDisabledRules(row?.rotinaDisabledRules);
  const storedWindow = row?.rotinaSalesWindowDays;
  const salesWindow = isRotinaSalesWindowDays(storedWindow) ? storedWindow : null;

  return {
    ownMinMarginPercent: ownMin ?? ROTINA_SETTINGS_DEFAULTS.ownMinMarginPercent,
    catalogMinMarginPercent:
      catalogMin ?? ROTINA_SETTINGS_DEFAULTS.catalogMinMarginPercent,
    ownTacosTargetPercent: tacos ?? ROTINA_SETTINGS_DEFAULTS.ownTacosTargetPercent,
    catalogRaiseCushionPercent:
      raiseCushion ?? ROTINA_SETTINGS_DEFAULTS.catalogRaiseCushionPercent,
    catalogRaiseMinPercent: raiseMin ?? ROTINA_SETTINGS_DEFAULTS.catalogRaiseMinPercent,
    disabledRules,
    promotionExpiringSoonDays:
      row?.promotionExpiringSoonDays ??
      OPERATIONAL_SETTINGS_DEFAULTS.promotionExpiringSoonDays,
    salesWindowDays: salesWindow ?? ROTINA_SETTINGS_DEFAULTS.salesWindowDays,
    configured:
      ownMin !== null ||
      catalogMin !== null ||
      tacos !== null ||
      raiseCushion !== null ||
      raiseMin !== null ||
      salesWindow !== null ||
      disabledRules.length > 0,
  };
}

export type RotinaSettingsUpdate = Partial<{
  ownMinMarginPercent: number;
  catalogMinMarginPercent: number;
  ownTacosTargetPercent: number;
  catalogRaiseCushionPercent: number;
  catalogRaiseMinPercent: number;
  disabledRules: RotinaRuleKey[];
  salesWindowDays: RotinaSalesWindowDays;
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
    ...(input.catalogRaiseCushionPercent !== undefined
      ? { rotinaCatalogRaiseCushionPercent: input.catalogRaiseCushionPercent }
      : {}),
    ...(input.catalogRaiseMinPercent !== undefined
      ? { rotinaCatalogRaiseMinPercent: input.catalogRaiseMinPercent }
      : {}),
    ...(input.disabledRules !== undefined
      ? { rotinaDisabledRules: normalizeDisabledRules(input.disabledRules) }
      : {}),
    ...(input.salesWindowDays !== undefined
      ? { rotinaSalesWindowDays: input.salesWindowDays }
      : {}),
  };

  await prisma.operationalSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  return loadRotinaSettings(organizationId);
}
