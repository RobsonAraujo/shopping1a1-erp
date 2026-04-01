import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidAccessToken } from "@/lib/mercadolibre/session";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    code?: string;
    state?: string;
  }>;
};

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;

  // ML sometimes returns to the root URL if that is the only redirect_uri
  // registered. Forward to the real OAuth handler so login completes.
  const code = sp.code;
  const state = sp.state;
  if (code && state && !sp.error) {
    const q = new URLSearchParams({ code, state });
    redirect(`/api/auth/mercadolibre/callback?${q.toString()}`);
  }

  const err = sp.error;
  const cookieStore = await cookies();
  const token = await getValidAccessToken(cookieStore);
  const isLoggedIn = Boolean(token);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-lg font-semibold text-[var(--brand)]">
            ERP 1a1
          </span>
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Abrir dashboard
            </Link>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <div className="rounded-xl border border-[var(--border)] bg-white p-8 shadow-sm sm:p-10">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--brand)]">
            Conecte sua loja
          </h1>
          <p className="mt-3 max-w-xl text-[var(--text-muted)]">
            Use sua conta do Mercado Livre para ver anúncios e estoque neste
            painel. O acesso usa OAuth de forma segura; credenciais ficam no
            servidor.
          </p>

          {err ? (
            <div
              className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              role="alert"
            >
              <p className="font-medium">Não foi possível concluir o login.</p>
              <p className="mt-1 break-all opacity-90">{err}</p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-4">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-md bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
              >
                Ir para o dashboard
              </Link>
            ) : (
              <a
                href="/api/auth/mercadolibre/signin"
                className="inline-flex items-center justify-center rounded-md bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
              >
                Conectar com Mercado Livre
              </a>
            )}
          </div>

          <p className="mt-8 text-xs text-[var(--text-muted)]">
            O redirect de OAuth precisa coincidir com o cadastro no app do
            Mercado Livre (incluindo caminho e HTTPS).
          </p>
        </div>
      </main>
    </div>
  );
}
