/**
 * Placeholder borrado (não um "carregando…") pra células que dependem de um
 * dado que ainda está chegando via streaming (SSE) — o resto da linha já
 * renderiza normal, só essa célula fica assim até o patch daquele item
 * chegar. Usado em Estoque (estoque Full em processamento) e Lucratividade
 * (preço/taxa/frete/margem).
 */
export function BlurredValue({ srLabel }: { srLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        className="select-none text-[var(--foreground)]/70 blur-[3px]"
      >
        88
      </span>
      <span className="sr-only">{srLabel}</span>
    </span>
  );
}
