/**
 * NCM é texto livre no cadastro do produto ("8516.31.00", "85163100",
 * " 8516 31 00 "). Toda comparação de NCM passa por aqui: só conta o NCM com
 * exatamente 8 dígitos.
 */
export function normalizeNcm(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

/** `85163100` → `8516.31.00`; NCM inválido volta como veio. */
export function formatNcm(raw: string): string {
  const digits = normalizeNcm(raw);
  if (!digits) return raw;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}
