/**
 * Saída de estoque registrada por vocês (lógica pura, usada pelo servidor e
 * pela tela). "Envio ao Full" só muda a mercadoria de lugar: sai do Em casa e
 * não mexe no custo (o Full sobe sozinho no ML quando ela chega). Os demais
 * motivos tiram a mercadoria do estoque de vez e consomem o lote (PEPS).
 */

export const EXIT_REASONS = {
  envio_full: "Envio ao Full",
  perda: "Perda ou extravio",
  avaria: "Avaria",
  brinde: "Brinde ou amostra",
  uso_interno: "Uso interno",
  devolucao_fornecedor: "Devolução ao fornecedor",
  outro: "Outro",
} as const;

export type ExitReason = keyof typeof EXIT_REASONS;

export const EXIT_REASON_OPTIONS = (Object.keys(EXIT_REASONS) as ExitReason[]).map((value) => ({
  value,
  label: EXIT_REASONS[value],
}));

export function isExitReason(value: string): value is ExitReason {
  return value in EXIT_REASONS;
}

export type ExitLine = { stockItemId: string; quantity: number };

export type ExitMovementDraft = {
  stockItemId: string;
  type: "full_transfer" | "manual_out";
  quantity: number;
  sourceLineKey: string;
  reason: string;
};

/** Uma movimentação por linha (o mesmo produto pode aparecer mais de uma vez). */
export function planStockExit(reason: ExitReason, lines: ExitLine[]): ExitMovementDraft[] {
  return lines
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0)
    .map((line, index) => ({
      stockItemId: line.stockItemId,
      type: reason === "envio_full" ? ("full_transfer" as const) : ("manual_out" as const),
      quantity: -line.quantity,
      sourceLineKey: `${index}:${line.stockItemId}`,
      reason: EXIT_REASONS[reason],
    }));
}
