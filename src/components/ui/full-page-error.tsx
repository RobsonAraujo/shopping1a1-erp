import Image from "next/image";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tela cheia para falhas que derrubam uma rota inteira — usado por `error.tsx`/`global-error.tsx`. */
export function FullPageError({
  title = "Algo deu errado",
  description,
  digest,
  onRetry,
}: {
  title?: string;
  description: string;
  /** `error.digest` do Next — referência pra achar o evento correspondente no Bugsink/log do servidor. */
  digest?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4 sm:px-6">
          <Image
            src="/logo-bg-blue.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg object-cover shadow-sm"
            priority
          />
          <span className="text-lg font-semibold tracking-tight text-[var(--primary)]">
            ERP 1a1
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-rose-200/90 bg-rose-50/90 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/35 sm:size-20">
            <TriangleAlert
              className="size-8 text-rose-700 dark:text-rose-200 sm:size-10"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
            {description}
          </p>
          {digest ? (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]/70">
              Código de referência: {digest}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {onRetry ? (
              <Button size="lg" className="gap-2" onClick={onRetry}>
                <RefreshCw className="size-4" aria-hidden />
                Tentar novamente
              </Button>
            ) : null}
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/dashboard">Ir para o Dashboard</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
