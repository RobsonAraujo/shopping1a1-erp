"use client";

import { useSyncExternalStore } from "react";
import { formatTodayLabel, formatWhen } from "@/lib/rotina/format";
import { isoIsToday } from "@/lib/rotina/time";

const CHECK_EVERY_MS = 60_000;

/** Relógio de minuto + volta à aba: o "hoje" vira sozinho depois da meia-noite. */
function subscribeToClock(onChange: () => void) {
  const timer = window.setInterval(onChange, CHECK_EVERY_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * "Já atualizei hoje?" no dia de São Paulo (o mesmo "hoje" de "Novo" e "Feitos
 * hoje"). O servidor manda a resposta do momento do carregamento; no cliente ela
 * é refeita a cada minuto, então uma aba esquecida aberta de um dia para o outro
 * passa a lembrar de atualizar sem precisar recarregar.
 */
export function useUpdatedToday(args: {
  lastCompleteRunAt: string | null;
  timeZone: string;
  serverUpdatedToday: boolean;
  serverTodayLabel: string;
  serverLastRunLabel: string | null;
}): { updatedToday: boolean; todayLabel: string; lastRunLabel: string | null } {
  const {
    lastCompleteRunAt,
    timeZone,
    serverUpdatedToday,
    serverTodayLabel,
    serverLastRunLabel,
  } = args;
  const updatedToday = useSyncExternalStore(
    subscribeToClock,
    () => isoIsToday(lastCompleteRunAt, new Date(), timeZone),
    () => serverUpdatedToday,
  );
  const todayLabel = useSyncExternalStore(
    subscribeToClock,
    () => formatTodayLabel(new Date(), timeZone),
    () => serverTodayLabel,
  );
  // "hoje às 09h" vira "ontem às 09h" depois da meia-noite, junto com o aviso.
  const lastRunLabel = useSyncExternalStore(
    subscribeToClock,
    () => (lastCompleteRunAt ? formatWhen(lastCompleteRunAt, new Date(), timeZone) : null),
    () => serverLastRunLabel,
  );
  return { updatedToday, todayLabel, lastRunLabel };
}
