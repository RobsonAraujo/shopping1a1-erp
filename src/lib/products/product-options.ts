import { prisma } from "@/lib/db/db";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { listingTypeLabelFromId } from "@/lib/pricing/financial-margin";
import {
  alignStockPrimaries,
  loadListingGroups,
  pickPrincipal,
  type ListingGroups,
  type ListingOption,
} from "@/lib/products/listing-groups";
import { ensureStockItemsForItems } from "@/lib/stock/stock-items";

/**
 * Cadastro com opções de venda (Meus Produtos): um cadastro por produto
 * físico, no anúncio principal; as outras opções (Clássico, Premium…) ficam
 * agrupadas nele, sem cadastro próprio. Ver `listing-groups.ts`.
 */

/** Opções do produto para a tela, só quando há mais de uma. */
export function productOptionsView(groups: ListingGroups, mlItemId: string): ListingOption[] | undefined {
  const options = groups.optionsOf(mlItemId);
  return options.length > 1 ? options : undefined;
}

export type ImportSuggestionOption = { mlItemId: string; listingTypeId: string | null };

export type ImportSuggestion = {
  mlItemId: string;
  sku: string | null;
  /** Todas as opções do produto entre os anúncios lidos, a sugerida primeiro. */
  options: ImportSuggestionOption[];
};

export type ImportPlan = {
  suggestions: ImportSuggestion[];
  /** Anúncios que não viram cadastro próprio: opções de um produto sugerido ou já cadastrado. */
  groupedOptionsCount: number;
};

function parseMlDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Um cadastro por produto físico entre os anúncios lidos do ML:
 * - produto com qualquer opção já cadastrada não é sugerido (o cadastro dele
 *   já vale para todas as opções);
 * - os demais viram uma sugestão só: o principal, com a lista das opções.
 */
export function planProductImport(items: readonly ItemBody[], groups: ListingGroups): ImportPlan {
  const byPrincipal = new Map<string, ItemBody[]>();
  for (const item of items) {
    if (!item.id) continue;
    const principal = groups.principalOf(item.id);
    const list = byPrincipal.get(principal) ?? [];
    list.push(item);
    byPrincipal.set(principal, list);
  }

  const suggestions: ImportSuggestion[] = [];
  let groupedOptionsCount = 0;
  for (const [principal, groupItems] of byPrincipal) {
    const options = groups.optionsOf(principal);
    if (options.some((option) => option.registered)) {
      // Produto já cadastrado: as opções sem cadastro próprio ficam com ele.
      const registeredIds = new Set(options.filter((o) => o.registered).map((o) => o.mlItemId));
      groupedOptionsCount += groupItems.filter((item) => !registeredIds.has(item.id)).length;
      continue;
    }
    const chosenId =
      groupItems.find((item) => item.id === principal)?.id ??
      pickPrincipal(
        groupItems.map((item) => ({
          mlItemId: item.id,
          product: null,
          isKit: false,
          active: item.status === "active",
          firstSeenAt: parseMlDate(item.date_created),
        })),
      );
    const chosen = groupItems.find((item) => item.id === chosenId) ?? groupItems[0];
    const ordered = [chosen, ...groupItems.filter((item) => item.id !== chosen.id)];
    groupedOptionsCount += groupItems.length - 1;
    suggestions.push({
      mlItemId: chosen.id,
      sku: getItemSku(chosen),
      options: ordered.map((item) => ({
        mlItemId: item.id,
        listingTypeId: item.listing_type_id ?? null,
      })),
    });
  }

  suggestions.sort((a, b) =>
    (a.sku ?? a.mlItemId).localeCompare(b.sku ?? b.mlItemId, "pt-BR", { sensitivity: "base" }),
  );
  return { suggestions, groupedOptionsCount };
}

/**
 * O anúncio pode receber um cadastro? Não, quando é opção de venda de um
 * produto que já tem cadastro — o cadastro do principal já vale para ele.
 */
export function cadastroBlockedMessage(
  groups: ListingGroups,
  item: Pick<ItemBody, "id" | "listing_type_id">,
): string | null {
  const options = groups.optionsOf(item.id);
  const registered = options.find((option) => option.registered && option.mlItemId !== item.id);
  if (!registered) return null;
  const type = listingTypeLabelFromId(item.listing_type_id);
  const which = type ? `a opção ${type}` : "uma opção de venda";
  return `Este anúncio é ${which} de ${registered.mlItemId}, que já está cadastrado. O cadastro do produto vale para todas as opções de venda.`;
}

/**
 * Depois de cadastrar: grava `Listing` + item de estoque dos anúncios (base
 * dos grupos) e alinha o principal do estoque ao anúncio cadastrado. Não
 * mexe no livro de estoque.
 */
export async function linkAfterCadastro(organizationId: string, items: ItemBody[]): Promise<void> {
  if (items.length > 0) await ensureStockItemsForItems(organizationId, items);
  await alignStockPrimaries(organizationId);
}

export class OptionCadastroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptionCadastroError";
  }
}

/**
 * Remove o cadastro de uma opção de venda (o produto continua cadastrado no
 * principal). Antes de apagar, leva para o principal o que apontava para a
 * opção — o banco reagiria em silêncio (`KitItem` em cascade some do kit; o
 * nivelamento com `SetNull` perderia o vínculo e passaria a casar por texto
 * de SKU):
 * - componente de kit: passa a ser o principal (somando, se o kit já o tem);
 * - nivelamento do DRE: passa ao principal, ou é descartado se o principal
 *   já tem um nivelamento no mesmo período;
 * - fornecedor: vai para o principal se ele ainda não tem.
 */
export async function removeOptionCadastro(
  organizationId: string,
  mlItemId: string,
  groups?: ListingGroups,
): Promise<{ principal: string }> {
  const resolved = groups ?? (await loadListingGroups(organizationId));
  const principal = resolved.principalOf(mlItemId);
  const principalOption = resolved.optionsOf(mlItemId).find((option) => option.isPrincipal);
  if (principal === mlItemId || !principalOption?.registered) {
    throw new OptionCadastroError(
      "Este cadastro não é de uma opção de venda de outro produto cadastrado.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const [option, principalProduct] = await Promise.all([
      tx.product.findFirst({ where: { organizationId, mlItemId }, select: { supplierId: true } }),
      tx.product.findFirst({
        where: { organizationId, mlItemId: principal },
        select: { supplierId: true },
      }),
    ]);
    if (!option || !principalProduct) {
      throw new OptionCadastroError("Cadastro não encontrado.");
    }

    const kitItems = await tx.kitItem.findMany({
      where: { organizationId, productMlItemId: mlItemId },
      select: { kitId: true, quantity: true },
    });
    for (const kitItem of kitItems) {
      const existing = await tx.kitItem.findFirst({
        where: { organizationId, kitId: kitItem.kitId, productMlItemId: principal },
        select: { quantity: true },
      });
      if (existing) {
        await tx.kitItem.updateMany({
          where: { organizationId, kitId: kitItem.kitId, productMlItemId: principal },
          data: { quantity: Number(existing.quantity) + Number(kitItem.quantity) },
        });
        await tx.kitItem.deleteMany({
          where: { organizationId, kitId: kitItem.kitId, productMlItemId: mlItemId },
        });
      } else {
        await tx.kitItem.updateMany({
          where: { organizationId, kitId: kitItem.kitId, productMlItemId: mlItemId },
          data: { productMlItemId: principal },
        });
      }
    }

    const [optionLevelings, principalLevelings] = await Promise.all([
      tx.dreProductCostLeveling.findMany({
        where: { organizationId, productMlItemId: mlItemId },
        select: { id: true, startDate: true, endDate: true },
      }),
      tx.dreProductCostLeveling.findMany({
        where: { organizationId, productMlItemId: principal },
        select: { startDate: true, endDate: true },
      }),
    ]);
    const period = (l: { startDate: Date; endDate: Date }) =>
      `${l.startDate.toISOString()}|${l.endDate.toISOString()}`;
    const principalPeriods = new Set(principalLevelings.map(period));
    for (const leveling of optionLevelings) {
      if (principalPeriods.has(period(leveling))) {
        await tx.dreProductCostLeveling.deleteMany({ where: { organizationId, id: leveling.id } });
      } else {
        await tx.dreProductCostLeveling.updateMany({
          where: { organizationId, id: leveling.id },
          data: { productMlItemId: principal },
        });
      }
    }

    if (!principalProduct.supplierId && option.supplierId) {
      await tx.product.updateMany({
        where: { organizationId, mlItemId: principal },
        data: { supplierId: option.supplierId },
      });
    }

    await tx.product.deleteMany({ where: { organizationId, mlItemId } });
  });

  await alignStockPrimaries(organizationId);
  return { principal };
}

/** Cadastros de opção ainda com custo pendente (vindos do "Importar todos"). */
export function pendingOptionCadastros(groups: ListingGroups): string[] {
  return groups
    .multiOptionGroups()
    .flatMap((options) =>
      options.filter((option) => !option.isPrincipal && option.registered && option.pendingCost),
    )
    .map((option) => option.mlItemId);
}
