import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { parseJsonBody, parseQuery, yearMonthSchema } from "../api-validation";

function fakeRequest(body: unknown, { invalidJson = false } = {}): Request {
  return {
    json: async () => {
      if (invalidJson) throw new Error("Unexpected token");
      return body;
    },
  } as unknown as Request;
}

const schema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0),
});

describe("parseJsonBody", () => {
  it("returns ok:true with the parsed data on a valid body", async () => {
    const result = await parseJsonBody(fakeRequest({ name: "Ana", age: 30 }), schema);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data, { name: "Ana", age: 30 });
    }
  });

  it("returns a 400 response for invalid JSON", async () => {
    const result = await parseJsonBody(fakeRequest(null, { invalidJson: true }), schema);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 400);
      const body = (await result.response.json()) as { error: string };
      assert.equal(body.error, "Invalid JSON");
    }
  });

  it("returns a 400 response with validation issues for a schema mismatch", async () => {
    const result = await parseJsonBody(fakeRequest({ name: "", age: -1 }), schema);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 400);
      const body = (await result.response.json()) as {
        error: string;
        issues: Array<{ path: string; message: string }>;
      };
      assert.equal(body.error, "Validation failed");
      assert.ok(body.issues.length >= 2);
      assert.ok(body.issues.some((i) => i.path === "name"));
      assert.ok(body.issues.some((i) => i.path === "age"));
    }
  });

  it("rejects a body that's missing required fields", async () => {
    const result = await parseJsonBody(fakeRequest({}), schema);
    assert.equal(result.ok, false);
  });

  it("applies schema transforms/defaults to the parsed data", async () => {
    const withDefault = z.object({ level: z.number().default(1) });
    const result = await parseJsonBody(fakeRequest({}), withDefault);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.level, 1);
  });
});

describe("parseQuery", () => {
  it("validates a plain query-params object", () => {
    const result = parseQuery({ year: "2026", month: "6" }, z.object({
      year: z.string(),
      month: z.string(),
    }));
    assert.equal(result.ok, true);
  });

  it("returns a 400 response for an invalid query", () => {
    const result = parseQuery({}, z.object({ year: z.string() }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 400);
  });
});

describe("yearMonthSchema", () => {
  it("accepts a valid year/month pair", () => {
    const result = yearMonthSchema.safeParse({ year: 2026, month: 6 });
    assert.equal(result.success, true);
  });

  it("rejects a month outside 1-12", () => {
    assert.equal(yearMonthSchema.safeParse({ year: 2026, month: 13 }).success, false);
    assert.equal(yearMonthSchema.safeParse({ year: 2026, month: 0 }).success, false);
  });

  it("rejects a year outside 2000-2100", () => {
    assert.equal(yearMonthSchema.safeParse({ year: 1999, month: 1 }).success, false);
    assert.equal(yearMonthSchema.safeParse({ year: 2101, month: 1 }).success, false);
  });

  it("rejects non-integer values", () => {
    assert.equal(yearMonthSchema.safeParse({ year: 2026.5, month: 6 }).success, false);
  });
});
