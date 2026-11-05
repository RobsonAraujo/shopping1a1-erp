"use client";

import { useState, type ReactNode } from "react";
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
import { PROMOTION_SUMMARY_ENDPOINT } from "@/config/dashboard-summary";
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

function joinSubtitle(parts: Array<string | null | false>): string {
  return parts.filter(Boolean).join(" · ");
}

/**
 * Lista com prévia de 5 linhas. O "Ver todos" expande a partir do dado que já
 * veio, com rolagem: repetir a varredura para mostrar as outras linhas custaria
 * centenas de chamadas ao Mercado Livre. O estado é efêmero de propósito.
 */
function PromotionList({
  rows,
  total,
  renderRow,
}: {
  rows: PromotionSummaryRow[];
  /** Pode passar de `rows.length`: a lista "sem promoção" tem teto. */
  total: number;
  renderRow: (row: PromotionSummaryRow) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, HOME_WIDGET_LIST_CAP);

  return (
    <>
      <HomeWidgetList
        hiddenCount={rows.length - visible.length}
        moreTotal={total}
        onMore={() => setExpanded(true)}
        scroll={expanded}
      >
        {visible.map(renderRow)}
      </HomeWidgetList>
      {expanded && total > rows.length ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Mostrando os {rows.length.toLocaleString("pt-BR")} mais vendidos de{" "}
          {total.toLocaleString("pt-BR")}.
        </p>
      ) : null}
    </>
  );
}

function PromotionGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-[var(--muted-foreground)]">
          {title}
        </h3>
        {count > 0 ? (
          <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
            {count.toLocaleString("pt-BR")}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ExpiringRow({ row }: { row: PromotionSummaryRow }) {
  const urgent = row.daysUntilEnd !== null && row.daysUntilEnd <= 1;
  return (
    <HomeWidgetListRow
      href={row.permalink}
      imageUrl={row.imageUrl}
      title={row.sku ?? "Sem SKU"}
      subtitle={joinSubtitle([
        formatFinancialMoney(row.salePrice),
        row.promotionName,
        row.catalogListing && "Catálogo",
      ])}
      trailing={daysUntilLabel(row.daysUntilEnd)}
      trailingClassName={urgent ? "text-rose-700" : "text-amber-800"}
      hint={`${row.title} · abrir no Mercado Livre`}
    />
  );
}

function WithoutPromotionRow({ row }: { row: PromotionSummaryRow }) {
  return (
    <HomeWidgetListRow
      href={row.permalink}
      imageUrl={row.imageUrl}
      title={row.sku ?? "Sem SKU"}
      subtitle={joinSubtitle([
        `${row.soldQuantity.toLocaleString("pt-BR")} vendidos`,
        row.catalogListing && "Catálogo",
      ])}
      trailing={formatFinancialMoney(row.salePrice)}
      hint={`${row.title} · abrir no Mercado Livre`}
    />
  );
}

/**
 * Promoções vencendo e anúncios sem promoção, nos tipos de anúncio escolhidos em
 * Configurações. É o widget mais lento da Home (varre todo anúncio monitorado com
 * 1-2 chamadas ao ML, `maxDuration = 300` na rota), então tem request próprio,
 * disparado só quando o card entra na viewport.
 *
 * Como no PMA, a seção nunca desaparece — vazia vira "tudo ok", falha vira
 * erro dentro da seção, e avisos de dado parcial aparecem ao lado.
 */
async function loadPromocoes(): Promise<PromotionSummaryPayload> {
  const res = await fetch(PROMOTION_SUMMARY_ENDPOINT, { cache: "no-store" });
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
    PROMOTION_SUMMARY_ENDPOINT,
    loadPromocoes,
    inView,
  );

  const data = entry.status === "ok" ? entry.value : null;
  // `?? []`: a Home não tem error boundary por widget, e um campo faltando numa
  // resposta de versão anterior não pode derrubar a página.
  const expiringSoon = data?.expiringSoon ?? [];
  const withoutPromotion = data?.withoutPromotion ?? [];
  const withoutTotal = data?.withoutPromotionCount ?? withoutPromotion.length;
  const days = data?.expiringSoonDays ?? null;
  const nothingMonitored =
    data?.monitor !== undefined && !data.monitor.own && !data.monitor.catalog;

  return (
    <div ref={setRef}>
      <HomeWidgetCard
        definitionId="promocoes"
        pending={entry.status === "loading"}
        error={entry.status === "error" ? entry.error : null}
        count={expiringSoon.length + withoutTotal}
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

        {nothingMonitored ? (
          <HomeWidgetEmpty
            title="Nenhum tipo de anúncio monitorado"
            description="Escolha quais anúncios acompanhar nas configurações."
            actionLabel="Abrir configurações"
            actionHref="/dashboard/configuracoes/planejamento"
          />
        ) : (
          <div className="space-y-4">
            <PromotionGroup
              title={
                days === null
                  ? "Vencendo"
                  : `Vencendo em até ${days} ${days === 1 ? "dia" : "dias"}`
              }
              count={expiringSoon.length}
            >
              {expiringSoon.length > 0 ? (
                <PromotionList
                  rows={expiringSoon}
                  total={expiringSoon.length}
                  renderRow={(row) => <ExpiringRow key={row.mlItemId} row={row} />}
                />
              ) : (
                <HomeWidgetEmpty
                  tone="ok"
                  title="Nenhuma promoção vencendo"
                  description="Nada termina nos próximos dias."
                />
              )}
            </PromotionGroup>

            <PromotionGroup title="Sem promoção" count={withoutTotal}>
              {withoutPromotion.length > 0 ? (
                <PromotionList
                  rows={withoutPromotion}
                  total={withoutTotal}
                  renderRow={(row) => (
                    <WithoutPromotionRow key={row.mlItemId} row={row} />
                  )}
                />
              ) : (
                <HomeWidgetEmpty
                  tone="ok"
                  title="Nenhum anúncio sem promoção"
                  description="Todos os anúncios monitorados têm promoção ativa."
                />
              )}
            </PromotionGroup>
          </div>
        )}
      </HomeWidgetCard>
    </div>
  );
}
