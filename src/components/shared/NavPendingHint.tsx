"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Retorno do clique num link de navegação enquanto a rota de destino não
 * responde: um ponto discreto no próprio link. Cobre as rotas sem `loading.tsx`,
 * sem custo de servidor.
 *
 * Tem de estar dentro do `<Link>` (exigência do `useLinkStatus`), e o `<Link>`
 * precisa de `relative`. Fica fora do fluxo para não mexer na largura do link. O
 * `delay-100` evita piscar na navegação que resolve na hora.
 */
export function NavPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute size-1.5 rounded-full bg-[var(--primary)] transition-opacity",
        pending ? "opacity-100 delay-100" : "opacity-0",
        className,
      )}
    />
  );
}
