import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { HomeDashboardHeader } from "@/components/home/dashboard/HomeDashboardHeader";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { HomeWidgetGrid } from "@/components/home/dashboard/HomeWidgetGrid";
import { fetchMe } from "@/lib/mercadolibre/api";
import { readSession } from "@/lib/mercadolibre/session";
import { getOrganizationContext } from "@/lib/organizations/context";
import { buildSellerReputationBadge } from "@/lib/mercadolibre/seller-reputation";
import { DashboardSalesCard } from "@/components/home/DashboardSalesCard";
import { buildDashboardSalesSnapshot } from "@/lib/home/sales-card-data";
import { loadHomeCoreSnapshot } from "@/lib/home/dashboard/home-core-snapshot";
import { loadDashboardLayout } from "@/lib/home/dashboard/dashboard-layout-data";
import { HOME_VIEW_COOKIE } from "@/lib/home/dashboard/dashboard-preferences";
import { cn } from "@/lib/utils";

/**
 * A Home é um **workspace configurável**: a grade de widgets sai do registry
 * (`src/lib/home/dashboard/widget-registry.ts`) e a seleção/ordem/tamanho
 * saem das preferências do usuário. Adicionar um card não passa mais por
 * aqui — é uma entrada no registry mais um componente no mapa do renderer.
 *
 * O que esta página faz, e só isto:
 *
 * 1. resolve sessão e tenant;
 * 2. carrega o snapshot barato de servidor (`loadHomeCoreSnapshot`) e o layout
 *    salvo (`loadDashboardLayout`), que é o que garante a Home **certa** na
 *    primeira pintura — não o layout padrão;
 * 3. mantém `fetchMe` como ilha de servidor — o header precisa do perfil de
 *    qualquer forma, então o KPI de vendas sai de graça do mesmo `cache()`;
 * 4. entrega tudo ao provider e sai da frente.
 *
 * Dado caro (DRE, apuração fiscal, estoque) vai por
 * `/api/dashboard/widgets` num request só, e só para os widgets visíveis.
 */

const loadSellerProfile = cache(async (token: string) =>
  fetchMe(token).catch(() => null),
);

function SellerIdentitySkeleton() {
  return (
    <div aria-hidden>
      <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--muted)] sm:h-9 sm:w-64" />
      <div className="mt-1.5 h-4 w-36 animate-pulse rounded bg-[var(--muted)]" />
    </div>
  );
}

function sellerCaptionFacts(
  me: Awaited<ReturnType<typeof loadSellerProfile>>,
): string[] {
  const badge = buildSellerReputationBadge(me?.seller_reputation);
  return [badge?.label].filter((fact): fact is string => Boolean(fact));
}

async function SellerIdentity({ token }: { token: string }) {
  const me = await loadSellerProfile(token);
  const nickname = me?.nickname?.trim() || null;
  const permalink = me?.permalink;
  const facts = sellerCaptionFacts(me);

  if (!nickname && facts.length === 0 && !permalink) {
    return null;
  }

  return (
    <div>
      {nickname ? (
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          {nickname}
        </h1>
      ) : null}
      {facts.length > 0 || permalink ? (
        <p
          className={cn(
            "flex flex-wrap items-center gap-x-2 text-[15px] text-[var(--muted-foreground)]",
            nickname && "mt-1.5",
          )}
        >
          {facts.length > 0 ? <span>{facts.join(" · ")}</span> : null}
          {permalink ? (
            <Link
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full p-1 hover:text-[var(--foreground)]"
              aria-label="Ver loja no Mercado Livre"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

async function SalesCardSection({ token }: { token: string }) {
  const snapshot = buildDashboardSalesSnapshot(await loadSellerProfile(token));
  if (!snapshot) return null;
  return <DashboardSalesCard snapshot={snapshot} />;
}

export const metadata: Metadata = {
  title: "Início",
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const { accessToken: token, userId } = readSession(cookieStore);

  if (!token || userId === undefined) {
    return null;
  }

  const orgContext = await getOrganizationContext();
  if (orgContext.status !== "active") {
    return null;
  }

  const organizationId = orgContext.organization.id;

  // Uma slice que falha vira aviso dentro do widget dela (ver `failedSlices`) —
  // antes uma falha de operações devolvia erro de página inteira e derrubava a
  // Home junto.
  //
  // O layout vai na mesma onda: é uma leitura por chave primária, e trazê-lo
  // aqui é o que permite renderizar a versão certa no servidor em vez de pintar
  // o padrão e trocar depois da hidratação.
  const [core, layout] = await Promise.all([
    loadHomeCoreSnapshot(organizationId),
    loadDashboardLayout(organizationId),
  ]);

  return (
    <HomeDashboardProvider
      core={core}
      layout={layout}
      viewId={cookieStore.get(HOME_VIEW_COOKIE)?.value ?? null}
      sellerCard={
        <Suspense fallback={<DashboardSalesCard pending />}>
          <SalesCardSection token={token} />
        </Suspense>
      }
    >
      <div className="space-y-6 sm:space-y-8">
        <HomeDashboardHeader>
          <Suspense fallback={<SellerIdentitySkeleton />}>
            <SellerIdentity token={token} />
          </Suspense>
        </HomeDashboardHeader>

        <HomeWidgetGrid />
      </div>
    </HomeDashboardProvider>
  );
}
