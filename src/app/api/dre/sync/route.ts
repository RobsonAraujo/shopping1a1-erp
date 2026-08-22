import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DRE_EDITABLE_LINE_KEYS,
  type DreEditableLineKey,
} from "@/lib/dre/dre-calculations";
import { loadDreYearView, type DreYearView } from "@/lib/dre/dre-year-data";
import {
  buildDreMonthSnapshot,
  persistDreMonthSnapshot,
  type DreSyncProgress,
} from "@/lib/dre/dre-month-data";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireOrganization } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";
import { isDreMonthSyncable } from "@/lib/mercadolibre/revenue-periods";

export const maxDuration = 300;

const syncBodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  preserveLineKeys: z
    .array(
      z.enum(
        DRE_EDITABLE_LINE_KEYS as unknown as [
          DreEditableLineKey,
          ...DreEditableLineKey[],
        ],
      ),
    )
    .optional()
    .default([]),
});

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

type DreSyncCompletePayload = {
  syncedAt: string;
  month: DreYearView["months"][number] | undefined;
  year: number;
  yearView: DreYearView;
};

async function runDreSync(args: {
  token: string;
  userId: number;
  organizationId: string;
  year: number;
  month: number;
  preserveLineKeys: DreEditableLineKey[];
  onProgress?: (progress: DreSyncProgress) => void;
}): Promise<DreSyncCompletePayload> {
  const { token, userId, organizationId, year, month, preserveLineKeys, onProgress } =
    args;

  onProgress?.({
    phase: "billing",
    message: "Iniciando sincronização do mês…",
  });

  const payload = await buildDreMonthSnapshot(
    token,
    userId,
    organizationId,
    year,
    month,
    { onProgress },
  );

  onProgress?.({ phase: "persist", message: "Salvando snapshot do DRE…" });

  const syncedAt = await persistDreMonthSnapshot(
    organizationId,
    year,
    month,
    payload,
    preserveLineKeys,
  );
  const yearView = await loadDreYearView(organizationId, year);
  const monthView = yearView.months.find((row) => row.month === month);

  onProgress?.({ phase: "done", message: "Sincronização concluída." });

  return {
    syncedAt: syncedAt.toISOString(),
    month: monthView,
    year: yearView.year,
    yearView,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireOrganization();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason },
      { status: auth.status },
    );
  }
  const { token, userId, organizationId } = auth.ctx;

  const parsedBody = await parseJsonBody(request, syncBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { year, month, preserveLineKeys } = parsedBody.data;

  if (!isDreMonthSyncable(year, month)) {
    return NextResponse.json(
      { error: "Não é possível sincronizar meses futuros." },
      { status: 400 },
    );
  }

  const stream =
    request.nextUrl.searchParams.get("stream") === "1" ||
    request.nextUrl.searchParams.get("stream") === "true";

  if (stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(sseLine(data)));
        };

        try {
          const result = await runDreSync({
            token,
            userId,
            organizationId,
            year,
            month,
            preserveLineKeys,
            onProgress: (progress) => {
              send({ type: "progress", ...progress });
            },
          });
          send({ type: "complete", ...result });
        } catch (e) {
          logServerError("api/dre/sync POST stream", e);
          const payload = apiErrorPayload(e, "dre_sync_failed");
          send({
            type: "error",
            message:
              typeof payload.error === "string"
                ? payload.error
                : "dre_sync_failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const result = await runDreSync({
      token,
      userId,
      organizationId,
      year,
      month,
      preserveLineKeys,
    });
    return NextResponse.json(result);
  } catch (e) {
    logServerError("api/dre/sync POST", e);
    return NextResponse.json(apiErrorPayload(e, "dre_sync_failed"), {
      status: 502,
    });
  }
}
