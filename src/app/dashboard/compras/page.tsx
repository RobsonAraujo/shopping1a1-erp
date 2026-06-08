import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import {
  buildSupplierSummaries,
  loadDashboardPurchaseData,
  type PurchaseAnalysisItemRow,
} from "@/lib/dashboard-purchase-data";
import { supplierPathSegment } from "@/lib/purchase-analysis";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSessionAccessState,
  readSession,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";

export default async function ComprasPage() {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard/compras"));
  }
  const token = session.accessToken;
  const { userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  let loadError: string | null = null;
  let summaries: ReturnType<typeof buildSupplierSummaries> = [];
  let needsPurchase: (row: PurchaseAnalysisItemRow) => boolean = () => false;
  let rows: PurchaseAnalysisItemRow[] = [];

  try {
    const data = await loadDashboardPurchaseData(token, userId);
    summaries = buildSupplierSummaries(data.rows, data.needsPurchase);
    needsPurchase = data.needsPurchase;
    rows = data.rows;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Erro ao carregar compras";
  }

  if (loadError) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-6 text-red-900">{loadError}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--primary)]">
          Compras por fornecedor
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Analise todos os produtos de cada fornecedor, veja rotação de vendas,
          quantidade sugerida e se ainda compensa repor estoque.
        </p>
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-[var(--muted-foreground)]">
            Nenhum anúncio ativo encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => {
            const hasAlert = rows.some(
              (r) =>
                r.supplier === summary.supplier && needsPurchase(r),
            );
            return (
              <Link
                key={summary.supplier}
                href={`/dashboard/compras/${supplierPathSegment(summary.supplier)}`}
                className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--muted)]/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-900">
                      <ShoppingCart className="size-5" aria-hidden />
                    </span>
                    <h2 className="text-lg font-semibold text-[var(--primary)]">
                      {summary.supplier}
                    </h2>
                  </div>
                  {hasAlert ? (
                    <Badge variant="warning" className="shrink-0">
                      Alerta
                    </Badge>
                  ) : null}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[var(--muted-foreground)]">Produtos</dt>
                    <dd className="font-semibold tabular-nums">
                      {summary.totalProducts}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-foreground)]">Urgentes</dt>
                    <dd className="font-semibold tabular-nums text-rose-900">
                      {summary.urgentCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-foreground)]">
                      Boa rotação
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {summary.highRotationCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-foreground)]">
                      Sem vendas
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {summary.noSalesCount}
                    </dd>
                  </div>
                </dl>

                <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                  <span className="font-semibold text-[var(--foreground)]">
                    {summary.suggestedUnitsTotal}
                  </span>{" "}
                  un. sugeridas no total
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
