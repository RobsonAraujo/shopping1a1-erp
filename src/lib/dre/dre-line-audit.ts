import { roundMoney } from "@/lib/pricing/financial-margin";
import {
  DRE_EDITABLE_LINE_KEYS,
  DRE_LINE_KEY_TO_BREAKDOWN_FIELD,
  getEditableLineAmount,
  type DreEditableLineKey,
  type DreLineAuditMismatch,
  type DreLineBreakdownItem,
  type DreMonthSnapshotPayload,
  type DreProductCostBreakdownItem,
  type DreTaxBreakdownItem,
} from "@/lib/dre/dre-calculations";

/**
 * Soma da lista de auditoria de uma linha, na mesma convenção da linha (custos
 * negativos). `null` = a linha não tem auditoria.
 *
 * Os dois totais que o DRE limita em zero (Custo produto, Impostos) seguem o
 * mesmo piso — senão um mês com crédito líquido acusaria divergência que não
 * existe.
 */
export function lineAuditSum(
  payload: DreMonthSnapshotPayload,
  lineKey: DreEditableLineKey,
): number | null {
  const field = DRE_LINE_KEY_TO_BREAKDOWN_FIELD[lineKey];
  if (!field) return null;
  const list = payload[field];
  if (!Array.isArray(list)) return null;

  if (field === "productCostBreakdown") {
    const total = (list as DreProductCostBreakdownItem[]).reduce(
      (sum, item) => sum + item.totalCost,
      0,
    );
    return roundMoney(-Math.max(0, total));
  }
  if (field === "taxBreakdown") {
    const total = (list as DreTaxBreakdownItem[]).reduce(
      (sum, item) => sum + item.totalTax,
      0,
    );
    return roundMoney(-Math.max(0, total));
  }
  return roundMoney(
    (list as DreLineBreakdownItem[]).reduce((sum, item) => sum + item.amount, 0),
  );
}

/** Valor da linha como a tela mostra (Faturamento inclui o bruto cancelado). */
function displayedLineValue(
  payload: DreMonthSnapshotPayload,
  lineKey: DreEditableLineKey,
): number {
  if (lineKey === "revenueMl") {
    // A auditoria do faturamento lista também os pedidos cancelados (como o
    // painel do ML) — compara com o faturamento que a tela soma.
    return roundMoney(
      payload.revenueMl + (payload.cancelledIncludeOverlay?.revenueGross ?? 0),
    );
  }
  return getEditableLineAmount(payload, lineKey);
}

/**
 * Linhas cujo valor não bate com a soma da própria auditoria. Compara
 * magnitudes: a fatura do ML lista alguns lançamentos com o sinal invertido
 * (ex.: Ads como valor positivo), e o que importa é a lista explicar o valor.
 *
 * Ficam de fora as linhas cujo valor não vem do sync — ajuste manual e
 * conciliação (a planilha é a verdade delas).
 */
export function checkLineAuditConsistency(
  payload: DreMonthSnapshotPayload,
): DreLineAuditMismatch[] {
  const skip = new Set<DreEditableLineKey>([
    ...(payload.manuallyEditedLineKeys ?? []),
    ...(payload.reconciliation?.lineKeys ?? []),
  ]);
  const mismatches: DreLineAuditMismatch[] = [];

  for (const lineKey of DRE_EDITABLE_LINE_KEYS) {
    if (skip.has(lineKey)) continue;
    const auditSum = lineAuditSum(payload, lineKey);
    if (auditSum === null) continue;
    const value = displayedLineValue(payload, lineKey);
    const valueAbs = Math.abs(value);
    const auditAbs = Math.abs(auditSum);
    const tolerance = Math.max(1, valueAbs * 0.005);
    if (Math.abs(valueAbs - auditAbs) <= tolerance) continue;
    mismatches.push({
      lineKey,
      value: roundMoney(value),
      auditSum,
      kind: valueAbs < 0.005 ? "zero_with_audit" : "differs",
    });
  }
  return mismatches;
}
