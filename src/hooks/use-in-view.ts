"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `true` quando o elemento entra (ou já está) na viewport. Usado pelos
 * widgets lentos da Home: eles só disparam o fetch quando o usuário chega
 * perto deles, em vez de no mount.
 *
 * `once: true` (padrão) faz o estado não voltar pra `false` ao sair da tela —
 * caso contrário um widget já carregado poderia desmontar/rebuscar ao rolar.
 */
export function useInView<T extends Element>(options?: {
  rootMargin?: string;
  once?: boolean;
}): readonly [(node: T | null) => void, boolean] {
  const { rootMargin = "200px", once = true } = options ?? {};
  // Sem IntersectionObserver (jsdom nos testes, browser antigo) o widget
  // precisa carregar normalmente — senão fica em branco pra sempre.
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  const [node, setNode] = useState<T | null>(null);
  /** "Já ficou visível" num ref, não em dep: o effect escreve esse sinal, e ler
   * o próprio `inView` nas deps só gerava desconectar/reobservar a cada
   * mudança (o mesmo formato de laço do batch de dados). */
  const settledRef = useRef(false);

  const setRef = useCallback((next: T | null) => {
    setNode(next);
  }, []);

  useEffect(() => {
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (once && settledRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible) {
          settledRef.current = true;
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, once, rootMargin]);

  return [setRef, inView] as const;
}
