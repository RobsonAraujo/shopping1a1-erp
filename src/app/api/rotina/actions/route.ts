import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/api/api-auth";
import { parseJsonBody } from "@/lib/api/api-validation";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import {
  RotinaActionNotFoundError,
  applyRotinaActionOp,
} from "@/lib/rotina/action-state-data";
import {
  ACTIONABLE_ROTINA_RULE_KEYS,
  type RotinaRuleKey,
} from "@/lib/rotina/rule-registry";

const actionableRuleKeys = ACTIONABLE_ROTINA_RULE_KEYS as [
  RotinaRuleKey,
  ...RotinaRuleKey[],
];

const bodySchema = z.object({
  mlItemId: z.string().regex(/^[A-Z]{3}\d+$/, "mlItemId inválido"),
  rule: z.enum(actionableRuleKeys),
  op: z.enum(["done", "ack", "snooze", "dismiss", "reopen"]),
  days: z.number().int().min(1).max(30).optional(),
});

/** Feito / ciente / adiar / ignorar / desfazer uma ação da Rotina. */
export async function PATCH(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    await applyRotinaActionOp(auth.ctx.organizationId, parsedBody.data);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof RotinaActionNotFoundError) {
      return NextResponse.json({ error: "rotina_listing_not_found" }, { status: 404 });
    }
    logServerError("api/rotina/actions PATCH", e);
    return NextResponse.json(apiErrorPayload(e, "rotina_action_failed"), { status: 502 });
  }
}
