"use client";

import { DashboardPmaAlertPanel } from "@/components/home/DashboardPmaAlertPanel";
import {
  HomeWidgetCard,
  HomeWidgetEmpty,
} from "@/components/home/dashboard/HomeWidgetCard";
import { useInView } from "@/hooks/use-in-view";
import { useWidgetFetch } from "@/hooks/use-widget-fetch";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import type { PmaAlertRow } from "@/lib/home/pma-alert-data";

const ENDPOINT = "/api/dashboard/widgets/pma";

async function loadPma(): Promise<PmaAlertRow[]> {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      formatApiErrorMessage(await readApiError(res, "pma_alerts_failed")),
    );
  }
  const json = (await res.json()) as { rows?: PmaAlertRow[] };
  return json.rows ?? [];
}

/**
 * Anúncios abaixo do preço mínimo anunciável.
 *
 * Passa pelo cache de módulo (`useWidgetFetch`) e não por `useState` local, por
 * um motivo concreto: arrastar este card para a outra coluna o **remonta** (duas
 * colunas são dois pais React, e mover um fiber entre pais é unmount + mount).
 * Com estado local, cada arrasto re-disparava a varredura de anúncios no Mercado
 * Livre — centenas de chamadas num seller médio. O `useInView` continua: a busca
 * só começa quando o card chega perto da viewport.
 *
 * A seção nunca desaparece: sem nada a alertar vira "tudo ok", e falha vira o
 * erro dentro do próprio card.
 */
export function HomeWidgetPma() {
  const [setRef, inView] = useInView<HTMLDivElement>();
  const entry = useWidgetFetch<PmaAlertRow[]>(ENDPOINT, loadPma, inView);

  const rows = entry.status === "ok" ? entry.value : null;

  return (
    <div ref={setRef}>
      <HomeWidgetCard
        definitionId="pma"
        pending={entry.status === "loading"}
        error={entry.status === "error" ? entry.error : null}
        count={rows?.length}
      >
        {rows && rows.length > 0 ? (
          <DashboardPmaAlertPanel rows={rows} />
        ) : (
          <HomeWidgetEmpty
            tone="ok"
            title="Nenhum anúncio abaixo do PMA"
            description="Todos estão acima do preço mínimo anunciável que você cadastrou."
          />
        )}
      </HomeWidgetCard>
    </div>
  );
}
