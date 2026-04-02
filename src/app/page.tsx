import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Shield } from "lucide-react";
import { getValidAccessToken } from "@/lib/mercadolibre/session";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    code?: string;
    state?: string;
  }>;
};

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;

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
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm">
              <Shield className="size-5" aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-tight text-[var(--primary)]">
              ERP 1a1
            </span>
          </div>
          {isLoggedIn ? (
            <Button size="sm" asChild>
              <Link href="/dashboard" className="gap-2">
                Dashboard
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <Card className="shadow-md">
          <CardHeader className="space-y-2 pb-2">
            <CardTitle className="text-3xl font-bold text-[var(--primary)]">
              Conecte sua loja
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Use sua conta do Mercado Livre para ver anúncios e estoque neste
              painel. O acesso usa OAuth de forma segura; credenciais ficam no
              servidor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {err ? (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
                role="alert"
              >
                <p className="font-medium">Não foi possível concluir o login.</p>
                <p className="mt-1 break-all opacity-90">{err}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {isLoggedIn ? (
                <Button size="lg" asChild>
                  <Link href="/dashboard" className="gap-2">
                    Ir para o dashboard
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button size="lg" asChild>
                  <a href="/api/auth/mercadolibre/signin" className="gap-2">
                    Conectar com Mercado Livre
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              )}
            </div>

            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              O redirect de OAuth precisa coincidir com o cadastro no app do
              Mercado Livre (incluindo caminho e HTTPS).
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
