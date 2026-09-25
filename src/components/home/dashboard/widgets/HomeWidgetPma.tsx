"use client";

import { useEffect, useState } from "react";
import { DashboardPmaAlertPanel } from "@/components/home/DashboardPmaAlertPanel";
import {
  DashboardSection,
  DashboardSectionClear,
} from "@/components/home/DashboardHomeSection";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFeedback } from "@/components/ui/user-feedback";
import { useInView } from "@/hooks/use-in-view";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import type { PmaAlertRow } from "@/lib/home/pma-alert-data";

/**
 * Anúncios abaixo do preço mínimo anunciável.
 *
 * Fetch próprio, fora do batch: faz 1-2 chamadas ao Mercado Livre por anúncio
 * com PMA cadastrado, e no batch travaria as outras chaves. Só dispara quando
 * o card chega perto da viewport — antes isso rodava no render do servidor e
 * era pago mesmo por quem não olhava.
 *
 * A seção nunca desaparece: sem nada a alertar vira "tudo ok", e falha vira o
 * erro dentro da própria seção. Esconder fazia o usuário achar que o recurso
 * não existe.
 */
export function HomeWidgetPma() {
  const [setRef, inView] = useInView<HTMLDivElement>();
  const [rows, setRows] = useState<PmaAlertRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inView) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/dashboard/widgets/pma", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          const code = await readApiError(res, "pma_alerts_failed");
          if (!cancelled) setError(formatApiErrorMessage(code));
          return;
        }
        const json = (await res.json()) as { rows: PmaAlertRow[] };
        if (!cancelled) setRows(json.rows ?? []);
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        setError(formatApiErrorMessage("pma_alerts_failed"));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [inView]);

  const pending = rows === null && error === null;

  return (
    <div ref={setRef}>
      <DashboardSection
        title="Abaixo do PMA"
        count={rows && rows.length > 0 ? rows.length : undefined}
      >
        {pending ? (
          <Skeleton className="h-24 rounded-3xl" />
        ) : error ? (
          <UserFeedback>{error}</UserFeedback>
        ) : rows && rows.length > 0 ? (
          <DashboardPmaAlertPanel rows={rows} />
        ) : (
          <DashboardSectionClear message="Nenhum anúncio abaixo do preço mínimo anunciável." />
        )}
      </DashboardSection>
    </div>
  );
}
