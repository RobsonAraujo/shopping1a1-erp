/**
 * Normaliza o WhatsApp opcional da tela `/conectar` para `55` + DDD + número
 * (só dígitos). Devolve `null` quando não parece um celular brasileiro: o campo
 * é opcional, então número inválido é ignorado em vez de travar o login.
 */
export function normalizeLeadPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Celular: DDD (11-99) + 9 + 8 dígitos.
  if (!/^[1-9][1-9]9\d{8}$/.test(digits)) return null;
  return `55${digits}`;
}
