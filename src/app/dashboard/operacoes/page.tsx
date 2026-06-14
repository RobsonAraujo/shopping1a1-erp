import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Kanban } from "lucide-react";
import { ReplenishmentKanban } from "@/components/replenishment-kanban";
import { Card, CardContent } from "@/components/ui/card";
import { loadReplenishmentBoard } from "@/lib/replenishment-cycle-data";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

export default async function OperacoesPage() {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard/operacoes"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  let loadError: string | null = null;
  let board: Awaited<ReturnType<typeof loadReplenishmentBoard>> | null = null;

  try {
    board = await loadReplenishmentBoard(token, userId);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Erro ao carregar operações";
  }

  if (loadError) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{loadError}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-900 shadow-sm">
          <Kanban className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
            Operações
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Acompanhe cada anúncio do alerta de compra até o estoque no galpão
            e envio ao Full. Use Avançar ou Mover para… em cada card.
          </p>
        </div>
      </header>

      {board ? <ReplenishmentKanban initialData={board} /> : null}
    </div>
  );
}
