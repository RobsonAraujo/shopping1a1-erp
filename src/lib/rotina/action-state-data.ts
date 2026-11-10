import { rotinaConfig } from "@/config/rotina";
import { prisma } from "@/lib/db/db";
import { listingBelongsToOrganization } from "@/lib/rotina/listing-targets";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import { startOfLocalDayPlus } from "@/lib/rotina/time";

/**
 * Decisões do usuário sobre uma ação (anúncio × regra). Grava só a decisão;
 * se a ação aparece ou não continua sendo da regra (avaliada na leitura) e da
 * visibilidade (`visibility.ts`).
 *
 * - `done` / `ack`: feito (condição) / ciente (evento)
 * - `snooze`: some até a meia-noite de `days` dias à frente
 * - `dismiss`: ignorar esta regra neste anúncio
 * - `reopen`: desfazer qualquer uma das anteriores
 */
export type RotinaActionOp = "done" | "ack" | "snooze" | "dismiss" | "reopen";

export class RotinaActionNotFoundError extends Error {
  constructor() {
    super("rotina_action_not_found");
  }
}

export async function applyRotinaActionOp(
  organizationId: string,
  input: { mlItemId: string; rule: RotinaRuleKey; op: RotinaActionOp; days?: number },
  now: Date = new Date(),
): Promise<void> {
  if (!(await listingBelongsToOrganization(organizationId, input.mlItemId))) {
    throw new RotinaActionNotFoundError();
  }

  const decision = (() => {
    switch (input.op) {
      case "done":
      case "ack":
        return { status: "done" as const, snoozedUntil: null };
      case "snooze":
        return {
          status: "snoozed" as const,
          snoozedUntil: startOfLocalDayPlus(
            now,
            Math.max(1, Math.min(30, input.days ?? 1)),
            rotinaConfig.timeZone,
          ),
        };
      case "dismiss":
        return { status: "dismissed" as const, snoozedUntil: null };
      case "reopen":
        return { status: "open" as const, snoozedUntil: null };
    }
  })();

  await prisma.listingActionState.upsert({
    where: {
      organizationId_mlItemId_rule: {
        organizationId,
        mlItemId: input.mlItemId,
        rule: input.rule,
      },
    },
    create: {
      organizationId,
      mlItemId: input.mlItemId,
      rule: input.rule,
      firstSeenAt: now,
      lastSeenAt: now,
      statusChangedAt: now,
      ...decision,
    },
    update: { statusChangedAt: now, ...decision },
  });
}
