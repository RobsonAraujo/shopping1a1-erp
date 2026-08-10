import type { ProductView } from "@/lib/product-data";

export type ProductsTableProps = {
  loading: boolean;
  sortedProducts: ProductView[];
  filteredProducts: ProductView[];
  searchQuery: string;
  formatPricingCostExplainer: (product: ProductView) => string;
  taxPercentExplainer: (product: ProductView) => string;
  onEdit: (product: ProductView) => void;
  onDelete: (sku: string) => void;
};
