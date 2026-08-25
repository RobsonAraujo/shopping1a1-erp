import type { ParsedFeeDetail, ParsedPaymentDetail } from "@/lib/dre/reconciliation/types";

export function parseBrMoney(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed);
  const digits = trimmed.replace(/[()\sR$]/gi, "").replace(/^-/, "");
  if (!digits) return null;
  const normalized = digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : digits;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

function parseBoolish(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const n = raw.trim().toLowerCase();
  if (["sim", "true", "1", "yes"].includes(n)) return true;
  if (["nao", "não", "false", "0", "no"].includes(n)) return false;
  return null;
}

export function parseFeeDetailsCell(cell: string | null | undefined): ParsedFeeDetail[] {
  if (!cell?.trim()) return [];
  const blocks = cell.split(/}\s*;?\s*{/).map((block, index, all) => {
    let text = block.trim();
    if (index === 0) text = text.replace(/^{/, "");
    if (index === all.length - 1) text = text.replace(/}$/, "");
    return text;
  });
  const fees: ParsedFeeDetail[] = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const pick = (label: string) => {
      const match = block.match(new RegExp(`${label}\\s*:\\s*([^\\n;]+)`, "i"));
      return match?.[1]?.trim() ?? null;
    };
    fees.push({
      feeId: pick("ID da tarifa") ?? pick("ID de la tarifa"),
      name: pick("Nome da tarifa") ?? pick("Nombre de la tarifa") ?? "",
      grossAmount: parseBrMoney(pick("Valor bruto")),
      discountAmount: parseBrMoney(
        pick("Desconto aplicado") ?? pick("Descuento aplicado"),
      ),
      netAmount: parseBrMoney(pick("Valor líquido") ?? pick("Valor liquido")),
      postpaid: parseBoolish(pick("Pós-paga") ?? pick("Pos-paga") ?? undefined),
    });
  }
  return fees;
}

export function parsePaymentDetailsCell(
  cell: string | null | undefined,
): ParsedPaymentDetail | null {
  if (!cell?.trim()) return null;
  const pick = (label: string) => {
    const match = cell.match(new RegExp(`${label}\\s*:\\s*([^\\n;}]+)`, "i"));
    return match?.[1]?.trim() ?? null;
  };
  const installmentsRaw = pick("Parcelas");
  const installments = installmentsRaw ? Number(installmentsRaw) : NaN;
  return {
    method: pick("Método") ?? pick("Metodo"),
    installments: Number.isFinite(installments) ? installments : null,
    status: pick("Status"),
    id: pick("ID"),
    paidAt: pick("Pago"),
    releasedAt: pick("Liberado"),
  };
}
