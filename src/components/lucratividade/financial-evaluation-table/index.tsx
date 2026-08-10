"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { FinancialEvaluationTableDesktop } from "@/components/lucratividade/financial-evaluation-table/FinancialEvaluationTableDesktop";
import { FinancialEvaluationTableMobile } from "@/components/lucratividade/financial-evaluation-table/FinancialEvaluationTableMobile";
import type { FinancialEvaluationTableProps } from "@/components/lucratividade/financial-evaluation-table/types";

export function FinancialEvaluationTable(props: FinancialEvaluationTableProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <FinancialEvaluationTableMobile {...props} />
  ) : (
    <FinancialEvaluationTableDesktop {...props} />
  );
}

export type { FinancialEvaluationTableProps } from "@/components/lucratividade/financial-evaluation-table/types";
