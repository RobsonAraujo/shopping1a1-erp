"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      className="fixed inset-0 z-50 flex h-screen animate-in fade-in-0 flex-col pb-12 duration-200"
      style={{ background: background || "var(--background)" }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/15 px-4 py-3 text-white backdrop-blur-md sm:px-6">
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
        <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
        {count !== undefined ? (
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">
            {count}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto gap-2 text-white hover:bg-white/15 hover:text-white"
          onClick={onExit}
        >
          <Minimize2 className="size-4" aria-hidden />
          Sair da tela cheia
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
