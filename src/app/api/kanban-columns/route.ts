import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OperationCycleKind } from "@/generated/prisma/client";
import {
  createKanbanColumn,
  loadOrMaterializeKanbanColumns,
} from "@/lib/compras/kanban-columns-data";
import { requireOrganization } from "@/lib/api/api-auth";
import { apiErrorPayload, logServerError } from "@/lib/infra/server-public-error";
import { parseJsonBody } from "@/lib/api/api-validation";

const kindSchema = z.nativeEnum(OperationCycleKind);

const postBodySchema = z.object({
  kind: kindSchema,
  label: z.string().trim().min(1, "Informe o nome da coluna").max(60),
});

export async function GET(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const kindParam = request.nextUrl.searchParams.get("kind");
  const parsedKind = kindSchema.safeParse(kindParam);
  if (!parsedKind.success) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }

  try {
    const columns = await loadOrMaterializeKanbanColumns(organizationId, parsedKind.data);
    return NextResponse.json({ columns });
  } catch (e) {
    logServerError("api/kanban-columns GET", e);
    return NextResponse.json(apiErrorPayload(e, "kanban_columns_load_failed"), {
      status: 502,
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, postBodySchema);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const column = await createKanbanColumn(
      organizationId,
      parsedBody.data.kind,
      parsedBody.data.label,
    );
    return NextResponse.json({ column });
  } catch (e) {
    logServerError("api/kanban-columns POST", e);
    return NextResponse.json(apiErrorPayload(e, "kanban_column_create_failed"), {
      status: 502,
    });
  }
}
