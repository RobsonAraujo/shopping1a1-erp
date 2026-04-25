import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChartNoAxesColumn,
  LayoutDashboard,
  LogOut,
  Package,
  Warehouse,
} from "lucide-react";
import { fetchMe } from "@/lib/mercadolibre/api";
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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-8">
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center gap-2 text-[var(--primary)] transition-opacity hover:opacity-90"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm">
                <LayoutDashboard className="size-5" aria-hidden />
              </span>
              <span className="hidden font-semibold tracking-tight sm:inline">
                ERP 1a1
              </span>
            </Link>
            <nav
              className="hidden items-center gap-1 sm:flex"
              aria-label="Principal"
            >
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard" className="gap-2">
                  <Package className="size-4" aria-hidden />
                  Anúncios
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/inventory" className="gap-2">
                  <Warehouse className="size-4" aria-hidden />
                  Estoque
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/catalog-report" className="gap-2">
                  <ChartNoAxesColumn className="size-4" aria-hidden />
                  Relatório catálogo
                </Link>
              </Button>
              {/* <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard#prioridades" className="gap-2">
                  Prioridades
                </Link>
              </Button> */}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <span
              className="hidden max-w-[12rem] truncate text-sm text-[var(--muted-foreground)] md:inline"
              title={nickname}
            >
              {nickname}
            </span>
            <form action="/api/auth/mercadolibre/signout" method="post">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="gap-2 border-[var(--border)]"
              >
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
