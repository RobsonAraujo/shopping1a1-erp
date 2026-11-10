/**
 * Eventos do "Atualizar" da Rotina (SSE). Só tipos — o client importa daqui
 * sem puxar código de servidor.
 */

export type RotinaRefreshStage = "listing" | "computing" | "finishing";

export type RotinaRefreshEvent =
  | { type: "stage"; stage: RotinaRefreshStage; message: string }
  | { type: "progress"; done: number; total: number };

export type RotinaRefreshResult = {
  runId: string;
  /** `partial`: o orçamento de tempo acabou — chame de novo para continuar. */
  status: "ok" | "partial";
  done: number;
  total: number;
  warnings: string[];
};

export type RotinaRefreshStreamEvent =
  | RotinaRefreshEvent
  | ({ type: "done" } & RotinaRefreshResult)
  | { type: "error"; message: string };
