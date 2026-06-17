import { ProductsClient } from "@/components/products-client";

export default function ProdutosPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Meus produtos
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Cadastre dados fiscais e de custo por SKU. A Lucratividade usa o custo
          de precificação e a alíquota de impostos calculados a partir deste
          cadastro.
        </p>
      </div>
      <ProductsClient />
    </div>
  );
}
