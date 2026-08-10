"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { ProductsTableDesktop } from "@/components/produtos/products-table/ProductsTableDesktop";
import { ProductsTableMobile } from "@/components/produtos/products-table/ProductsTableMobile";
import type { ProductsTableProps } from "@/components/produtos/products-table/types";

export function ProductsTable(props: ProductsTableProps) {
  const isMobile = useIsMobile();
  return isMobile ? <ProductsTableMobile {...props} /> : <ProductsTableDesktop {...props} />;
}
