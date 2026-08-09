import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Compass, House, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página não encontrada",
};

export default function NotFound() {
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
          <div className="relative mb-2">
            <span
              aria-hidden
              className="select-none text-[7rem] leading-none font-black tracking-tighter text-[var(--primary)]/10 sm:text-[9rem]"
            >
              404
            </span>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex size-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm sm:size-20">
                <Compass
                  className="size-8 text-[var(--primary)] sm:size-10"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>
            </div>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Essa página não existe
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
            O endereço pode ter mudado, sido removido, ou você digitou algo
            errado. Vamos te levar de volta pra onde as coisas fazem sentido.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/dashboard">
                <House className="size-4" aria-hidden />
                Ir para o Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/">
                <Search className="size-4" aria-hidden />
                Voltar ao início
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
