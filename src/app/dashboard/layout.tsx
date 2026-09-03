import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { DashboardNav } from "@/components/shared/DashboardNav";
import { MobileDashboardMenu } from "@/components/shared/MobileDashboardMenu";
import { Button } from "@/components/ui/button";
import { AccountBlockedNotice } from "@/components/shared/AccountBlockedNotice";
import { getOrganizationContext } from "@/lib/organizations/context";

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
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]/85 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--card)]/75">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center gap-2 text-[var(--primary)] transition-opacity hover:opacity-90"
            >
              <Image
                src="/logo-bg-blue.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg object-cover shadow-sm"
                priority
              />
              <span className="hidden font-semibold tracking-tight sm:inline">
                ERP 1a1
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span
                className="hidden max-w-[10rem] truncate text-sm text-[var(--muted-foreground)] lg:inline xl:max-w-[12rem]"
                title={nickname}
              >
                {nickname}
              </span>
              <MobileDashboardMenu />
              <form
                action="/api/auth/mercadolibre/signout"
                method="post"
                className="hidden sm:block"
              >
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[var(--border)]"
                >
                  <LogOut className="size-4" aria-hidden />
                  <span className="hidden lg:inline">Sair</span>
                </Button>
              </form>
            </div>
          </div>
          <DashboardNav />
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10"
      >
        {orgContext.status === "active" ? (
          children
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
    </div>
  );
}
