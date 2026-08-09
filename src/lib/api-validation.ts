import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";

/** Common `{ year, month }` shape reused across DRE/tax-report write routes. */
export const yearMonthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

function validationErrorResponse(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Validation failed",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 },
  );
}

/** Parses a Request body as JSON and validates it against a zod schema.
 * Returns `{ ok: true, data }` on success, or `{ ok: false, response }` with a
 * ready-to-return 400 response describing the first validation failure. */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<ParsedBody<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: validationErrorResponse(result.error) };
  }
  return { ok: true, data: result.data };
}

/** Same as {@link parseJsonBody}, but for query params already parsed into a
 * plain object (e.g. `Object.fromEntries(request.nextUrl.searchParams)`). */
export function parseQuery<T>(
  query: Record<string, string | undefined>,
  schema: ZodType<T>,
): ParsedBody<T> {
  const result = schema.safeParse(query);
  if (!result.success) {
    return { ok: false, response: validationErrorResponse(result.error) };
  }
  return { ok: true, data: result.data };
}
