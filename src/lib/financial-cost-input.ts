function normalizeEditableNumber(raw: string): string {
  return raw
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/%/g, "");
}

/** Parse de campo monetário (aceita 11,97 / 11.97 / R$ 11,97). */
export function parseMoneyCostInput(
  value: string,
): number | null | "invalid" {
  const trimmed = normalizeEditableNumber(value);
  if (trimmed === "") return null;

  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;

  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

/** Parse de campo percentual (aceita 12,25 / 12.25 / 12,25%). */
export function parsePercentCostInput(
  value: string,
): number | null | "invalid" {
  const parsed = parseMoneyCostInput(value);
  if (parsed === "invalid") return "invalid";
  if (parsed === null) return null;
  if (parsed > 100) return "invalid";
  return parsed;
}
