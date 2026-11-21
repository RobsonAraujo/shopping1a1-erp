"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBeforeUnloadGuard } from "@/hooks/use-before-unload-guard";
import type { StockActivationResult } from "@/lib/stock/stock-activation";
import { markStockBackgroundSyncFresh } from "@/components/stock/StockBackgroundSync";
import { StockBlockingOverlay } from "@/components/stock/StockBlockingOverlay";
import { stockProgressMessage, useStockStream } from "@/components/stock/use-stock-stream";

type Problem = { message: string; stopped: boolean };

/**
 * Primeira visita ao Estoque: prepara e ativa sozinho, sem perguntas. Lê os
 * anúncios e o estoque de cada um no ML e grava o saldo inicial, com a tela
 * de bloqueio e o progresso. Parou ou falhou: oferece tentar de novo (nada
 * fica pela metade, a ativação grava tudo de uma vez no final).
 *
 * `children` é o esqueleto da Posição, por trás da tela de bloqueio.
 */
export function StockAutoActivation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { running, progress, start, cancel } = useStockStream<StockActivationResult>();
  const [opening, startOpening] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [ready, setReady] = useState(false);
  const started = useRef(false);

  useBeforeUnloadGuard(running);

  const activate = useCallback(async () => {
    const outcome = await start("/api/stock/activation", {});
    if (!outcome.ok) {
      setProblem({ message: outcome.error, stopped: outcome.aborted === true });
      return;
    }
    markStockBackgroundSyncFresh();
    setReady(true);
    startOpening(() => router.refresh());
  }, [start, router]);

  useEffect(() => {
    // Começa fora do corpo do efeito (a ativação atualiza o estado da tela) e
    // uma vez só: o modo estrito do React monta duas vezes em desenvolvimento,
    // e a primeira montagem cancela o seu agendamento.
    const id = window.setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void activate();
    }, 0);
    return () => window.clearTimeout(id);
  }, [activate]);

  function retry() {
    setProblem(null);
    setReady(false);
    void activate();
  }

  if (problem && !running) {
    return (
      <Card className="rounded-2xl p-6 sm:p-8">
        <div className="flex max-w-2xl items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <PackageCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              {problem.stopped ? "O estoque ainda não foi preparado" : "Não deu para preparar o estoque agora"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {problem.stopped
                ? "Na primeira vez, o ERP lê seus anúncios e o estoque de cada um no Mercado Livre. Leva cerca de um minuto, e nada muda no Mercado Livre."
                : problem.message}
            </p>
            <Button className="mt-4" onClick={retry}>
              <RotateCw aria-hidden />
              {problem.stopped ? "Preparar agora" : "Tentar de novo"}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Ativou, mas a página ainda não trocou (a atualização falhou): um clique resolve.
  if (ready && !opening && !running) {
    return (
      <Card className="flex flex-col items-start gap-3 rounded-2xl p-6 sm:p-8">
        <p className="text-sm text-[var(--foreground)]">Estoque pronto.</p>
        <Button onClick={() => startOpening(() => router.refresh())}>Abrir o estoque</Button>
      </Card>
    );
  }

  return (
    <>
      {children}
      {running || opening ? (
        <StockBlockingOverlay
          title="Preparando seu estoque"
          message={ready ? "Pronto! Abrindo o estoque…" : stockProgressMessage(progress)}
          note={ready ? undefined : "Só na primeira vez. O ERP só lê o Mercado Livre, nada muda lá."}
          done={progress?.phase === "positions" && !ready ? progress.done : undefined}
          total={progress?.phase === "positions" && !ready ? progress.total : undefined}
          onCancel={running ? cancel : undefined}
        />
      ) : null}
    </>
  );
}
