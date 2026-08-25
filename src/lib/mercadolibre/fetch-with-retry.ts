export class MlApiFetchError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "MlApiFetchError";
    this.status = status;
    this.url = url;
  }
}

export function isRetryableMlStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const DEFAULT_BACKOFF_MS = [1000, 2000];
const DEFAULT_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Combina o `signal` do caller (se houver) com um timeout — sem isso, uma chamada ao ML que trava sem responder segura o sync até o limite da rota inteira. */
function withTimeoutSignal(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options?: {
    maxAttempts?: number;
    backoffMs?: number[];
    timeoutMs?: number;
  },
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastStatus = 0;
  const callerSignal = init.signal;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        signal: withTimeoutSignal(callerSignal, timeoutMs),
      });
    } catch (error) {
      if (callerSignal?.aborted) {
        // Cancelamento pedido por quem chamou (ex.: usuário cancelou a
        // sync) — não é um erro de rede, não faz sentido tentar de novo.
        throw error;
      }
      const canRetryTimeout = attempt < maxAttempts - 1;
      if (!canRetryTimeout) {
        throw new MlApiFetchError(
          `Mercado Livre API não respondeu em ${timeoutMs}ms`,
          0,
          url,
        );
      }
      const delay =
        backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 1000;
      await sleep(delay);
      continue;
    }
    if (res.ok) return res;

    lastStatus = res.status;
    const canRetry =
      isRetryableMlStatus(res.status) && attempt < maxAttempts - 1;
    if (!canRetry) {
      throw new MlApiFetchError(
        `Mercado Livre API respondeu com status ${res.status}`,
        res.status,
        url,
      );
    }

    const delay = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 1000;
    await sleep(delay);
  }

  throw new MlApiFetchError(
    `Mercado Livre API respondeu com status ${lastStatus}`,
    lastStatus,
    url,
  );
}
