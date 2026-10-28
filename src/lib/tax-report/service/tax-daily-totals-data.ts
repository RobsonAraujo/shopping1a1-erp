import { prisma } from "@/lib/db/db";

/**
 * Leituras enxutas do imposto "ao vivo" (Produtos/Lucratividade). As somas e
 * projeções rodam no Postgres e só os números por anúncio trafegam — o
 * payload por venda nunca sai do banco.
 *
 * `$queryRaw*` NÃO passa pelo tenant guard: o filtro por organization_id é
 * obrigatório em todas as consultas daqui.
 */

const RECENT_SNAPSHOTS_LIMIT = 12;

export type TaxSnapshotMeta = {
  year: number;
  month: number;
  /** `meta.geradoEm` do snapshot (versão do cálculo). */
  generatedAt: string;
  /** Quando os pedidos foram buscados no ML (`pedidosBuscadosEm ?? geradoEm`). */
  ordersFetchedAt: string;
  hasDailyTotals: boolean;
};

export type TaxWindowRow = {
  mlItemId: string | null;
  skus: string[];
  receita: number;
  imposto: number;
};

export type TaxFallbackRow = {
  mlItemId: string | null;
  sku: string;
  skuAliases: string[] | null;
  impostoOperacionalMedioPercentual: number | null;
  impostoOperacionalTotal: number | null;
  receitaTotal: number;
  year: number;
  month: number;
  generatedAt: string;
};

/**
 * Snapshots mais recentes do seller (só metadados), do mais novo ao mais
 * antigo — o mesmo conjunto que `loadTaxFallbackRows` lê, para as datas de
 * cada mês virem daqui em vez de repetidas em cada linha do fallback.
 */
export async function loadTaxSnapshotMetas(
  organizationId: string,
  sellerId: number,
): Promise<TaxSnapshotMeta[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      year: number;
      month: number;
      generatedAtColumn: Date;
      geradoEm: string | null;
      pedidosBuscadosEm: string | null;
      hasDailyTotals: boolean;
    }>
  >(
    `select year, month, generated_at as "generatedAtColumn",
            payload_summary->'meta'->>'geradoEm' as "geradoEm",
            payload_summary->'meta'->>'pedidosBuscadosEm' as "pedidosBuscadosEm",
            daily_totals is not null as "hasDailyTotals"
     from tax_report_month_snapshots
     where organization_id = $1 and seller_id = $2
       and payload_summary is not null
     order by year desc, month desc
     limit ${RECENT_SNAPSHOTS_LIMIT}`,
    organizationId,
    BigInt(sellerId),
  );
  return rows.map((row) => {
    const generatedAt = row.geradoEm ?? row.generatedAtColumn.toISOString();
    return {
      year: row.year,
      month: row.month,
      generatedAt,
      ordersFetchedAt: row.pedidosBuscadosEm ?? generatedAt,
      hasDailyTotals: row.hasDailyTotals,
    };
  });
}

/**
 * Receita e imposto operacional por anúncio somados nos dias `[from, to]`
 * (`YYYY-MM-DD`, inclusive). Venda sem itemId (defensivo) agrupa pelo SKU.
 *
 * Cada dia conta só pelo snapshot do próprio mês: a venda da última hora do
 * mês (23h−23h59 em −04:00, já 00h do dia 1 em São Paulo) vem nos dois
 * snapshots, e sem esse filtro entraria duas vezes na janela.
 */
export async function loadTaxWindowTotals(
  organizationId: string,
  sellerId: number,
  window: { from: string; to: string },
): Promise<TaxWindowRow[]> {
  const monthIndex = (ymd: string) => {
    const [year, month] = ymd.split("-").map(Number);
    return year * 12 + month;
  };
  return prisma.$queryRawUnsafe<TaxWindowRow[]>(
    `select e->>'k' as "mlItemId",
            array_agg(distinct e->>'s') as skus,
            sum((e->>'r')::numeric)::float8 as receita,
            sum((e->>'i')::numeric)::float8 as imposto
     from tax_report_month_snapshots s
     cross join lateral jsonb_array_elements(s.daily_totals) e
     where s.organization_id = $1 and s.seller_id = $2
       and s.daily_totals is not null
       and s.year * 12 + s.month between $3 and $4
       and e->>'d' between $5 and $6
       and left(e->>'d', 7) = s.year::text || '-' || lpad(s.month::text, 2, '0')
     group by e->>'k', case when e->>'k' is null then e->>'s' end`,
    organizationId,
    BigInt(sellerId),
    monthIndex(window.from),
    monthIndex(window.to),
    window.from,
    window.to,
  );
}

/**
 * % mensal por anúncio, do mês mais recente em que cada par (anúncio, SKU)
 * aparece nos últimos snapshots — para anúncio sem venda na janela. Projeta
 * só os campos usados em vez de trazer o `payloadSummary` inteiro. Ordem:
 * mês mais recente primeiro e, dentro do mês, a ordem do relatório.
 */
export async function loadTaxFallbackRows(
  organizationId: string,
  sellerId: number,
): Promise<Omit<TaxFallbackRow, "generatedAt">[]> {
  return prisma.$queryRawUnsafe<Omit<TaxFallbackRow, "generatedAt">[]>(
    `select "mlItemId", sku, "skuAliases", "impostoOperacionalMedioPercentual",
            "impostoOperacionalTotal", "receitaTotal", year, month
     from (
       select distinct on (coalesce(e.value->>'mlItemId', ''), e.value->>'sku')
              e.value->>'mlItemId' as "mlItemId",
              e.value->>'sku' as sku,
              e.value->'skuAliases' as "skuAliases",
              (e.value->>'impostoOperacionalMedioPercentual')::float8 as "impostoOperacionalMedioPercentual",
              (e.value->>'impostoOperacionalTotal')::float8 as "impostoOperacionalTotal",
              coalesce((e.value->>'receitaTotal')::float8, 0) as "receitaTotal",
              s.year, s.month, e.ordinality
       from (
         select year, month, payload_summary
         from tax_report_month_snapshots
         where organization_id = $1 and seller_id = $2
           and payload_summary is not null
         order by year desc, month desc
         limit ${RECENT_SNAPSHOTS_LIMIT}
       ) s
       cross join lateral jsonb_array_elements(s.payload_summary->'porSku')
         with ordinality as e(value, ordinality)
       order by coalesce(e.value->>'mlItemId', ''), e.value->>'sku',
                s.year desc, s.month desc
     ) latest
     order by year desc, month desc, ordinality`,
    organizationId,
    BigInt(sellerId),
  );
}
