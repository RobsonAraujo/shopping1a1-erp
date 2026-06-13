import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChartNoAxesColumn,
  LayoutGrid,
  LogOut,
  Package,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { fetchMe } from "@/lib/mercadolibre/api";
import { PushNotificationToggle } from "@/components/push-notification-toggle";
import { MobileDashboardMenu } from "@/components/mobile-dashboard-menu";
import {
  getSessionAccessState,
  refreshSessionPath,
} from "@/lib/mercadolibre/session";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = getSessionAccessState(cookieStore);
  if (!session.isLoggedIn) {
    redirect("/");
  }
  if (session.needsRefresh) {
    redirect(refreshSessionPath("/dashboard"));
  }

  let nickname = "Conta";
  if (session.accessToken) {
    try {
      const me = await fetchMe(session.accessToken);
      nickname = me.nickname || `ID ${me.id}`;
    } catch {
      // keep default label
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]/85 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--card)]/75">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-3.5">
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
              <PushNotificationToggle />
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
          <nav
            className="mt-2 hidden flex-wrap items-center gap-1 sm:flex"
            aria-label="Principal"
          >
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard" className="gap-2">
                <Package className="size-4" aria-hidden />
                Anúncios
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/resumo" className="gap-2">
                <LayoutGrid className="size-4" aria-hidden />
                Resumo
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/inventory" className="gap-2">
                <Warehouse className="size-4" aria-hidden />
                Estoque
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/compras" className="gap-2">
                <ShoppingCart className="size-4" aria-hidden />
                Compras
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/catalog-report" className="gap-2">
                <ChartNoAxesColumn className="size-4" aria-hidden />
                <span className="hidden xl:inline">Relatório catálogo</span>
                <span className="xl:hidden">Catálogo</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/lucratividade" className="gap-2">
                <TrendingUp className="size-4" aria-hidden />
                Lucratividade
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
