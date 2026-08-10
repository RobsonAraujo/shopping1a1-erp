import type { IcmsRateRow } from "@/lib/tax-report/types";

export type IcmsRateRowEditorProps = {
  row: IcmsRateRow;
  saving: boolean;
  onSave: (row: IcmsRateRow) => Promise<void>;
};
