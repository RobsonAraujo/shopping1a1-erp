/**
 * Fronteira entre o id de vendedor do ML no banco e no domínio da aplicação.
 *
 * As colunas `ml_user_id` / `seller_id` são `BIGINT`: ids de vendedor do
 * Mercado Livre passaram de 2^31 (a conta 3711648215 quebrava o callback OAuth
 * com "value out of range for the type integer"). O Prisma devolve essas
 * colunas como `bigint`.
 *
 * O domínio continua em `number` — exato até 2^53, e ids ML estão na casa de
 * 4e9. A conversão acontece **só aqui**, na fronteira do Prisma.
 *
 * Regra que importa: um `bigint` nunca pode escapar para JSON ou para props de
 * Client Component. `JSON.stringify` lança `TypeError: Do not know how to
 * serialize a BigInt` e o `tsc` **não** pega esse caso. Converta na função de
 * repositório que lê a linha, não lá na frente.
 */

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Domínio -> Prisma. Use em `create`/`upsert` para marcar a fronteira. */
export function toDbSellerId(id: number): bigint {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Invalid ML seller id: ${id}`);
  }
  return BigInt(id);
}

/** Prisma -> domínio. Use em toda leitura que traga o id de volta. */
export function fromDbSellerId(id: bigint): number {
  if (id <= BigInt(0) || id > MAX_SAFE) {
    throw new Error(`ML seller id out of safe range: ${id}`);
  }
  return Number(id);
}

/**
 * Lê um id vindo de texto (cookie de sessão, argv de script, env de cron).
 * Devolve `undefined` em vez de `NaN` para entrada inválida — quem chama trata
 * como "não autenticado" em vez de deixar um `NaN` descer até o Prisma.
 */
export function parseSellerId(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
