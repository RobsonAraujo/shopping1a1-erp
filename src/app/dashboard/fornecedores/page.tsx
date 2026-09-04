import type { Metadata } from "next";
import { FornecedoresClient } from "@/components/fornecedores/FornecedoresClient";

export const metadata: Metadata = {
  title: "Fornecedores",
};

export default function FornecedoresPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)] sm:text-3xl">
          Fornecedores
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Cadastre seus fornecedores e arraste os produtos até eles (ou vincule
          pelo cadastro em <span className="font-medium">Meus produtos</span>).
          Produtos sem fornecedor vinculado continuam agrupados pelo texto do
          SKU em Compras e Estoque.
        </p>
      </div>
      <FornecedoresClient />
    </div>
  );
}
