import type { IcmsRateRow } from "@/lib/tax-report/types";
import type { TableSort } from "@/components/ui/sortable-th";

export type IcmsRateSortKey = "uf" | "aliquotaBase" | "fcp";

export type IcmsRatesTableProps = {
  rows: IcmsRateRow[];
};

export type IcmsRatesTableViewProps = IcmsRatesTableProps & {
  sort: TableSort<IcmsRateSortKey>;
  onSortChange: (key: IcmsRateSortKey) => void;
};
