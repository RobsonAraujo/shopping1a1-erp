"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function KanbanFullscreenFrame({
  active,
  title,
  count,
  background,
  onExit,
  children,
}: {
  active: boolean;
  title: string;
  count?: number;
  /** CSS `background` (cor sólida ou gradiente) do quadro — em tela cheia
   * cobre a viewport inteira, como no Trello. */
  background?: string;
  onExit: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [shouldAnimateEnter] = useState(!active);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [active, onExit]);

  if (!active) return <>{children}</>;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex h-dvh flex-col bg-[var(--background)] max-sm:pb-[env(safe-area-inset-bottom)] sm:h-screen sm:pb-12",
        shouldAnimateEnter && "animate-in fade-in-0 duration-200",
      )}
    >
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto gap-2 text-white hover:bg-white/15 hover:text-white max-sm:px-2"
            onClick={onExit}
            aria-label="Sair da tela cheia"
          >
            <Minimize2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sair da tela cheia</span>
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:min-h-full sm:overflow-visible">{children}</div>
      </div>
    </div>
  );
}
