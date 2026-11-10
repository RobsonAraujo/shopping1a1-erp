import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import type { ActionStateSnapshot } from "@/lib/rotina/types";

/**
 * Memória das ações da rodada: o que a rodada viu disparar vira/continua
 * aberto, o que parou de disparar é resolvido sozinho. Puro — devolve a lista
 * de escritas e quem chama traduz para o banco.
 *
 * - dispara, sem estado → `create` (nasce hoje: "novo")
 * - dispara, estado resolvido → `reopen` (episódio novo: `firstSeenAt` de agora)
 * - dispara, estado aberto/feito/adiado/ignorado → `touch` (só `lastSeenAt`;
 *   a visibilidade decide se o "feito" volta como "continua")
 * - não dispara, estado aberto/feito/adiado → `resolve`
 * - não dispara, ignorado → nada: continua ignorado se voltar a acontecer
 */
export type StateWrite =
  | { op: "create"; mlItemId: string; rule: RotinaRuleKey }
  | { op: "touch"; mlItemId: string; rule: RotinaRuleKey }
  | { op: "reopen"; mlItemId: string; rule: RotinaRuleKey }
  | { op: "resolve"; mlItemId: string; rule: RotinaRuleKey };

export function stateKey(mlItemId: string, rule: string): string {
  return `${mlItemId}|${rule}`;
}

export function reconcileRefreshStates(input: {
  itemIds: readonly string[];
  rules: readonly RotinaRuleKey[];
  /** `stateKey(mlItemId, rule)` de tudo que disparou nesta rodada. */
  firing: ReadonlySet<string>;
  existing: readonly ActionStateSnapshot[];
}): StateWrite[] {
  const byKey = new Map(
    input.existing.map((state) => [stateKey(state.mlItemId, state.rule), state]),
  );
  const writes: StateWrite[] = [];

  for (const mlItemId of input.itemIds) {
    for (const rule of input.rules) {
      const key = stateKey(mlItemId, rule);
      const state = byKey.get(key);
      const fires = input.firing.has(key);

      if (fires) {
        if (!state) writes.push({ op: "create", mlItemId, rule });
        else if (state.status === "resolved") writes.push({ op: "reopen", mlItemId, rule });
        else writes.push({ op: "touch", mlItemId, rule });
        continue;
      }

      if (
        state &&
        (state.status === "open" ||
          state.status === "done" ||
          state.status === "snoozed")
      ) {
        writes.push({ op: "resolve", mlItemId, rule });
      }
    }
  }

  return writes;
}
