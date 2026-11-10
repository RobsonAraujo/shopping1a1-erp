/**
 * Defaults da Rotina (central de ações do dia). Os três primeiros são o que a
 * organização vê até salvar as próprias metas — `OperationalSettings.rotina*`
 * nulo cai aqui. O resto é mecânica da rodada de atualização.
 */
export const rotinaConfig = {
  /** Margem mínima (após ADS, %) sugerida para anúncios próprios. */
  ownMinMarginPercent: 2,
  /** Margem mínima (após ADS, %) sugerida para anúncios de catálogo. */
  catalogMinMarginPercent: 2,
  /** TACOS (%) a partir do qual um anúncio próprio entra em "TACOS acima da meta". */
  ownTacosTargetPercent: 10,
  /** Fuso que decide o que é "hoje" (novo hoje, feito hoje, resolvido hoje). */
  timeZone: "America/Sao_Paulo",
  /**
   * Orçamento de tempo de uma chamada de "Atualizar" (`maxDuration` da rota é
   * 300 s). Passou disso, a rodada fica `partial` e o overlay chama de novo
   * para continuar de onde parou — nada calculado se perde, cada lote já foi
   * gravado.
   */
  refreshBudgetMs: 240_000,
  /** Anúncios por lote: cada lote é gravado (e reconciliado) antes do próximo. */
  refreshChunkSize: 20,
  /** Concorrência do cálculo de margem + mínimos (cada um faz dezenas de cotações). */
  floorConcurrency: 3,
  /**
   * Rodada `running` sem batimento há mais que isto é considerada morta (a
   * função serverless foi encerrada) e libera a trava.
   */
  runHeartbeatStaleMs: 2 * 60_000,
  /** Uma rodada `partial` mais nova que isto é retomada em vez de recomeçar. */
  runResumeWindowMs: 60 * 60_000,
  /** Janela do histórico de catálogo lida para "perdendo desde". */
  catalogHistoryDays: 30,
  /**
   * Catálogo ligado a um próprio só vira aviso se o anúncio de catálogo tiver
   * sido criado há no máximo isto — um catálogo antigo que só agora entrou no
   * radar não é notícia.
   */
  takeoverMaxAgeDays: 30,
} as const;

export type RotinaConfig = typeof rotinaConfig;
