import type { Metadata } from "next";
import { Package } from "lucide-react";
import { ProductsClient } from "@/components/produtos/ProductsClient";

export const metadata: Metadata = {
  title: "Meus produtos",
};

export default function ProdutosPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] sm:size-11">
          <Package className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Meus produtos
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Cadastre dados fiscais e de custo por SKU. A Lucratividade usa o custo
            de precificação e a alíquota de impostos calculados a partir deste
            cadastro.
          </p>
        </div>
      </div>
      <ProductsClient />
    </div>
  );
}
