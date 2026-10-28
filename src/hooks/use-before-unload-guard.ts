"use client";

import { useEffect } from "react";

/**
 * Enquanto `active`, fechar ou recarregar a aba pede confirmação do navegador.
 * Sync e recálculos rodam no servidor junto com a conexão aberta: sair no meio
 * interrompe o processo (e o usuário perde o retorno do que aconteceu). A
 * navegação dentro do app já fica bloqueada pelo overlay da tela.
 */
export function useBeforeUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Navegadores antigos só mostram o aviso com `returnValue` preenchido.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
