/**
 * Saldo inicial Em casa de cada item na ativação (puro, sem banco).
 *
 * O galpão que a organização digitava já incluía o depósito do ML. Mas em
 * casa há pelo menos o que o ML mostra no depósito: quando o galpão estava
 * vazio ou menor (desatualizado, ou nunca digitado), vale o depósito. Assim
 * nenhum produto começa com Galpão negativo.
 */

/** Começo da nota do saldo inicial que pede conferência (fica no extrato do produto). */
export const OPENING_CHECK_NOTE_PREFIX = "Confira:";

export type OpeningInput = {
  /** Soma do galpão digitado (`WarehouseStock.quantity`) nos anúncios do item. */
  legacyWarehouse: number;
  /** Quantos anúncios do item tinham galpão preenchido. */
  legacyWarehouseListings: number;
  /** Depósito do ML lido na ativação (`null`: a leitura falhou). */
  depositQty: number | null;
};

export function openingOwnFor(input: OpeningInput): { own: number; note: string | null } {
  const legacy = Math.max(0, Math.round(input.legacyWarehouse));
  const deposit = Math.max(0, Math.round(input.depositQty ?? 0));
  const own = Math.max(legacy, deposit);

  if (input.legacyWarehouseListings > 1) {
    return {
      own,
      note: `${OPENING_CHECK_NOTE_PREFIX} o galpão estava digitado em ${input.legacyWarehouseListings} opções de venda deste produto, e os números foram somados.`,
    };
  }
  if (legacy > 0 && deposit > legacy) {
    return {
      own,
      note: `${OPENING_CHECK_NOTE_PREFIX} o galpão digitado (${legacy}) era menor que o depósito do ML (${deposit}), então o saldo inicial usou o depósito.`,
    };
  }
  if (legacy === 0 && deposit > 0) {
    return { own, note: "Sem galpão digitado: o saldo inicial usou o depósito do ML." };
  }
  return { own, note: null };
}
