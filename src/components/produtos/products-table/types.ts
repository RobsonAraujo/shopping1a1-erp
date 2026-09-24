import type { TableSort } from "@/components/ui/sortable-th";
import type { ProductView } from "@/lib/products/product-data";

export type ProductSortKey = "sku" | "ncm" | "pricingCost" | "taxPercent";

export type ProductsTableProps = {
  loading: boolean;
  sortedProducts: ProductView[];
  filteredProducts: ProductView[];
  searchQuery: string;
  sort: TableSort<ProductSortKey>;
  onSortChange: (key: ProductSortKey) => void;
  formatPricingCostExplainer: (product: ProductView) => string;
  taxPercentExplainer: (product: ProductView) => string;
  /** false para empresas Simples Nacional — oculta colunas/badges fiscais de Lucro Real. */
  showFiscalFlags?: boolean;
  onEdit: (product: ProductView) => void;
  onDelete: (mlItemId: string) => void;
  onToggleActive: (mlItemId: string, nextActive: boolean) => void;
  /** Re-lê o SKU do anúncio no ML e grava. */
  onSyncSku: (mlItemId: string) => void;
  /** mlItemId com sync de SKU em andamento — desabilita o botão e gira o ícone. */
  syncingSkuId: string | null;
};
