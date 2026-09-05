import { prisma } from "@/lib/db/db";
import type { DreVisibilitySettings } from "@/lib/dre/dre-table-rows";

export function toDreVisibilitySettings(row: {
  showInvestments: boolean;
  showNonOperationalOut: boolean;
  showNonOperationalIn: boolean;
}): DreVisibilitySettings {
  return {
    showInvestments: row.showInvestments,
    showNonOperationalOut: row.showNonOperationalOut,
    showNonOperationalIn: row.showNonOperationalIn,
  };
}

/** Preferências de exibição do DRE — puramente visuais, nunca afetam o
 * cálculo. Compartilhado entre `GET /api/dre/display-settings` e o
 * carregamento inicial (server) da tela DRE. */
export async function loadDreDisplaySettings(
  organizationId: string,
): Promise<DreVisibilitySettings> {
  const row = await prisma.dreDisplaySettings.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
  return toDreVisibilitySettings(row);
}
