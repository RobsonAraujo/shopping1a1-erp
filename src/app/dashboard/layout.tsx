import Link from "next/link";
import { Toaster } from "sonner";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { DashboardAccountMenu, DashboardNav } from "@/components/shared/DashboardNav";
import { DashboardMobileTabBar } from "@/components/shared/DashboardMobileTabBar";
import { MobileDashboardMenu } from "@/components/shared/MobileDashboardMenu";
import { AccountBlockedNotice } from "@/components/shared/AccountBlockedNotice";
import { getOrganizationContext } from "@/lib/organizations/context";
import { StockBackgroundSync } from "@/components/stock/StockBackgroundSync";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const orgContext = await getOrganizationContext();

  const nickname =
    orgContext.status === "active" || orgContext.status === "blocked"
      ? orgContext.organization.name
      : "Conta";

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--primary-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-20 sm:px-6">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center"
            aria-label="Maipo"
          >
            {/* Na faixa sm–lg o menu ocupa a largura: só o símbolo. */}
            <BrandLogo className="h-7 sm:hidden lg:block lg:h-8" />
            <BrandLogo variant="symbol" className="hidden h-7 sm:block lg:hidden" />
          </Link>
          <DashboardNav />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <DashboardAccountMenu accountName={nickname} />
            <MobileDashboardMenu accountName={nickname} />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-10 sm:pb-10"
      >
        {orgContext.status === "active" ? (
          <>
            {children}
            {/* Estoque sem cron: lê as vendas novas em segundo plano enquanto alguém usa o ERP. */}
            <StockBackgroundSync />
          </>
        ) : orgContext.status === "blocked" ? (
          <AccountBlockedNotice organization={orgContext.organization} />
        ) : (
          // "unauthenticated"/"no_organization": middleware já deveria ter
          // redirecionado antes de chegar aqui; casca mínima como último recurso.
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            Não foi possível carregar sua conta. Tente sair e entrar novamente.
          </p>
        )}
      </main>
      <DashboardMobileTabBar />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
