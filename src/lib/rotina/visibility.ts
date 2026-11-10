import type { RotinaRuleKind } from "@/lib/rotina/rule-registry";
import type { ActionStateSnapshot } from "@/lib/rotina/types";

export type ActionBucket = "active" | "done" | "snoozed" | "dismissed";

export type ActionVisibility = {
  bucket: ActionBucket;
  /** Foi marcada como feita, mas o dado mais novo diz que a condição continua. */
  continues: boolean;
};

/**
 * Onde uma ação que **dispara agora** aparece, dado o que o usuário decidiu.
 *
 * - Feito (condição): some até chegar dado mais novo que o clique (`dataAt` —
 *   a rodada ou o poll do catálogo). Se o dado novo ainda dispara a regra,
 *   volta com "continua".
 * - Ciente (evento): some de vez.
 * - Adiado: some até `snoozedUntil`.
 * - Ignorado: fica na lista de ignorados até desfazer.
 * - Episódio novo (`episodeStart` depois da decisão): a decisão antiga não vale
 *   mais — ex.: catálogo que voltou a ganhar e perdeu de novo.
 */
export function resolveActionVisibility(input: {
  kind: RotinaRuleKind;
  state: ActionStateSnapshot | null;
  now: Date;
  dataAt: string | null;
  episodeStart: string | null;
}): ActionVisibility {
  const { state } = input;
  if (!state) return { bucket: "active", continues: false };
  if (state.status === "dismissed") return { bucket: "dismissed", continues: false };

  const decidedAt = state.statusChangedAt;
  const snoozeActive =
    state.snoozedUntil !== null && state.snoozedUntil > input.now.toISOString();

  if (input.kind === "event") {
    if (state.status === "done") return { bucket: "done", continues: false };
    if (state.status === "snoozed" && snoozeActive) {
      return { bucket: "snoozed", continues: false };
    }
    return { bucket: "active", continues: false };
  }

  const newEpisode =
    input.episodeStart !== null && input.episodeStart > decidedAt;

  if (state.status === "done") {
    if (newEpisode) return { bucket: "active", continues: false };
    if (input.dataAt !== null && input.dataAt > decidedAt) {
      return { bucket: "active", continues: true };
    }
    return { bucket: "done", continues: false };
  }

  if (state.status === "snoozed") {
    if (newEpisode || !snoozeActive) return { bucket: "active", continues: false };
    return { bucket: "snoozed", continues: false };
  }

  return { bucket: "active", continues: false };
}
