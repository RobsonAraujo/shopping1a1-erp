import type { TableSort } from "@/components/ui/sortable-th";
import type { ListingOptionChip } from "@/lib/products/listing-option-label";
import type { ProductView } from "@/lib/products/product-data";
import type { IcmsIncentiveRule } from "@/lib/tax-incentives/types";

export type ProductSortKey = "sku" | "ncm" | "pricingCost" | "taxPercent" | "pmaPrice";

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
  /** Incentivos de ICMS por NCM normalizado — selo "Incentivo X%" na coluna NCM. */
  incentiveByNcm?: ReadonlyMap<string, IcmsIncentiveRule>;
  onEdit: (product: ProductView) => void;
  onDelete: (mlItemId: string) => void;
  onToggleActive: (mlItemId: string, nextActive: boolean) => void;
  /** Re-lê o SKU do anúncio no ML e grava. */
  onSyncSku: (mlItemId: string) => void;
  /** mlItemId com sync de SKU em andamento — desabilita o botão e gira o ícone. */
  syncingSkuId: string | null;
  /** Remove o cadastro duplicado de uma opção de venda (o produto fica no principal). */
  onRemoveDuplicateOption?: (product: ProductView, option: ListingOptionChip) => void;
  /** mlItemId da opção com remoção em andamento. */
  removingOptionId?: string | null;
};
