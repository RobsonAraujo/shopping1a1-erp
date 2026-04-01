import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { fetchMe } from "@/lib/mercadolibre/api";
import { getValidAccessToken } from "@/lib/mercadolibre/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  if (!token) {
    redirect("/");
  }

  let nickname = "Conta";
  try {
    const me = await fetchMe(token);
    nickname = me.nickname || `ID ${me.id}`;
  } catch {
    // keep default label
  }

  return (
    <div className="min-h-full flex flex-col bg-[var(--surface-muted)]">
      <header className="bg-[var(--brand)] text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight text-white hover:opacity-90"
            >
              ERP 1a1
            </Link>
            <span className="hidden text-sm text-white/80 sm:inline">
              {nickname}
            </span>
          </div>
          <form action="/api/auth/mercadolibre/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-white/30 bg-transparent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
