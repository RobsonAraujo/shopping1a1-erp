"use client";

import { useInView } from "@/hooks/use-in-view";
import { useWidgetFetch } from "@/hooks/use-widget-fetch";
import {
  HOME_WIDGET_LIST_CAP,
  HomeWidgetCard,
  HomeWidgetEmpty,
  HomeWidgetList,
  HomeWidgetListRow,
} from "@/components/home/dashboard/HomeWidgetCard";
import { UserFeedback } from "@/components/ui/user-feedback";
import { formatApiErrorMessage, readApiError } from "@/lib/api/api-client-error";
import { formatFinancialMoney } from "@/lib/pricing/financial-margin";
import type {
  PromotionSummaryPayload,
  PromotionSummaryRow,
} from "@/lib/home/promotion-summary-data";

function daysUntilLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `${days} dias`;
}

function PromotionList({ rows }: { rows: PromotionSummaryRow[] }) {
  return (
    <HomeWidgetList hiddenCount={Math.max(0, rows.length - HOME_WIDGET_LIST_CAP)}>
      {rows.slice(0, HOME_WIDGET_LIST_CAP).map((row) => {
        const urgent = row.daysUntilEnd !== null && row.daysUntilEnd <= 1;
        return (
          <HomeWidgetListRow
            key={row.mlItemId}
            href={row.permalink}
            imageUrl={row.imageUrl}
            title={row.sku ?? "Sem SKU"}
            subtitle={`${formatFinancialMoney(row.salePrice)}${row.promotionName ? ` · ${row.promotionName}` : ""}`}
            trailing={daysUntilLabel(row.daysUntilEnd)}
            trailingClassName={urgent ? "text-rose-700" : "text-amber-800"}
            hint={`${row.title} · abrir no Mercado Livre`}
          />
        );
      })}
    </HomeWidgetList>
  );
}

/**
 * Promoções terminando. É o widget mais lento da Home (varre todo anúncio
 * ativo com 1-2 chamadas ao ML, `maxDuration = 300` na rota), então tem
 * request próprio, disparado só quando o card entra na viewport.
 *
 * Como no PMA, a seção nunca desaparece — vazia vira "tudo ok", falha vira
 * erro dentro da seção, e avisos de dado parcial aparecem ao lado.
 */
const ENDPOINT = "/api/dashboard/summary/promotions";

async function loadPromocoes(): Promise<PromotionSummaryPayload> {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  // Checa `ok` ANTES de ler o corpo: um 502 com corpo não-JSON (o host devolvendo
  // texto, por exemplo) fazia o `res.json()` estourar e a mensagem crua do parser
  // ("Unexpected token…") aparecer no card.
  if (!res.ok) {
    throw new Error(
      formatApiErrorMessage(await readApiError(res, "promotion_summary_failed")),
    );
  }
  return (await res.json()) as PromotionSummaryPayload;
}

export function HomeWidgetPromocoes() {
  const [setRef, inView] = useInView<HTMLDivElement>();
  const entry = useWidgetFetch<PromotionSummaryPayload>(
    ENDPOINT,
    loadPromocoes,
    inView,
  );

  const data = entry.status === "ok" ? entry.value : null;
  const expiringSoon = data?.expiringSoon ?? [];

  return (
    <div ref={setRef}>
      <HomeWidgetCard
        definitionId="promocoes"
        pending={entry.status === "loading"}
        error={entry.status === "error" ? entry.error : null}
        count={expiringSoon.length}
      >
        {data?.warnings?.length ? (
          <div className="mb-3">
            <UserFeedback tone="warning" title="Alguns dados não chegaram">
              <ul className="list-disc space-y-1 pl-4">
                {data.warnings.slice(0, 5).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
                {data.warnings.length > 5 ? (
                  <li>… e mais {data.warnings.length - 5} aviso(s).</li>
                ) : null}
              </ul>
            </UserFeedback>
          </div>
        ) : null}

        {expiringSoon.length > 0 ? (
          <PromotionList rows={expiringSoon} />
        ) : (
          <HomeWidgetEmpty
            tone="ok"
            title="Nenhuma promoção vencendo"
            description="Nada termina nos próximos dias."
          />
        )}
      </HomeWidgetCard>
    </div>
  );
}
