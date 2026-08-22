import type { IcmsRateRow } from "@/lib/tax-report/types";
import type { TableSort } from "@/components/ui/sortable-th";

export type IcmsRateSortKey = "uf" | "aliquotaBase" | "fcp";

export type IcmsRateRowEditorProps = {
  row: IcmsRateRow;
  saving: boolean;
  onSave: (row: IcmsRateRow) => Promise<void>;
};

export type IcmsRatesTableProps = {
  rows: IcmsRateRow[];
  saving: boolean;
  onSave: (row: IcmsRateRow) => Promise<void>;
};

export type IcmsRatesTableViewProps = IcmsRatesTableProps & {
  sort: TableSort<IcmsRateSortKey>;
  onSortChange: (key: IcmsRateSortKey) => void;
};
