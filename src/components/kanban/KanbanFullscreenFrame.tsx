"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Quadro em tela cheia (estilo Trello) dos Kanbans de Compras e Operações
 * Full — é o único modo desses boards; sai-se pelos botões Voltar/Início. */
export function KanbanFullscreenFrame({
  title,
  count,
  background,
  children,
}: {
  title: string;
  count?: number;
  /** CSS `background` (cor sólida ou gradiente) do quadro — em tela cheia
   * cobre a viewport inteira, como no Trello. */
  background?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-[var(--background)] max-sm:pb-[env(safe-area-inset-bottom)] sm:h-screen sm:pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={background ? { background } : undefined}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/15 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white backdrop-blur-md sm:gap-3 sm:px-6 sm:py-3 sm:pt-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/15 hover:text-white"
            onClick={() => router.back()}
            aria-label="Voltar"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/15 hover:text-white"
            onClick={() => router.push("/dashboard")}
            aria-label="Ir para o início"
          >
            <Home className="size-4" aria-hidden />
          </Button>
          <h2 className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</h2>
          {count !== undefined ? (
            <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">
              {count}
            </span>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:min-h-full sm:overflow-visible">{children}</div>
      </div>
    </div>
  );
}
