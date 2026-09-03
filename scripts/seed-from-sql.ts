/**
 * Runs pasted Supabase SQL against the local DB (DATABASE_URL).
 *
 * Usage:
 *   1. Paste INSERT (or any SQL) into prisma/seeds/seed.sql
 *   2. npm run seed:sql
 *   3. Optional upsert: npm run seed:sql -- --conflict=sku
 *      (or --conflict=id, etc. — PK / unique column for ON CONFLICT)
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db/db";

const SQL_PATH = path.join(process.cwd(), "prisma", "seeds", "seed.sql");

function parseConflictColumn(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith("--conflict=")) {
      const col = arg.slice("--conflict=".length).trim();
      return col || null;
    }
    if (arg === "--conflict") {
      throw new Error("Use --conflict=<column>, e.g. --conflict=sku");
    }
  }
  return null;
}

function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

/** Extract quoted column names from INSERT INTO ... (cols) VALUES */
function extractInsertColumns(sql: string): string[] | null {
  const match = sql.match(
    /INSERT\s+INTO\s+[\w."]+\s*\(([^)]+)\)\s*VALUES/i,
  );
  if (!match) return null;
  return match[1]
    .split(",")
    .map((col) => col.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function countValueTuples(sql: string): number {
  const valuesIdx = sql.search(/\bVALUES\b/i);
  if (valuesIdx < 0) return 0;
  const valuesPart = sql.slice(valuesIdx);
  let depth = 0;
  let count = 0;
  let inString = false;
  for (let i = 0; i < valuesPart.length; i++) {
    const ch = valuesPart[i];
    if (ch === "'" && valuesPart[i - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "(") {
      if (depth === 0) count++;
      depth++;
    } else if (ch === ")") {
      depth--;
    }
  }
  return count;
}

function withOnConflictUpsert(sql: string, conflictColumn: string): string {
  if (/\bON\s+CONFLICT\b/i.test(sql)) {
    return sql.endsWith(";") ? sql : `${sql};`;
  }

  const columns = extractInsertColumns(sql);
  if (!columns || columns.length === 0) {
    throw new Error(
      "Could not parse INSERT column list. Expected: INSERT INTO ... (cols) VALUES (...)",
    );
  }

  const conflictLower = conflictColumn.toLowerCase();
  if (!columns.some((c) => c.toLowerCase() === conflictLower)) {
    throw new Error(
      `Conflict column "${conflictColumn}" is not in the INSERT column list.`,
    );
  }

  const updateCols = columns.filter((c) => c.toLowerCase() !== conflictLower);
  if (updateCols.length === 0) {
    throw new Error(
      `INSERT has no columns to update on conflict besides ${conflictColumn}`,
    );
  }

  const setClause = updateCols
    .map((col) => `"${col}" = EXCLUDED."${col}"`)
    .join(",\n  ");

  const trimmed = sql.replace(/;\s*$/, "").trim();
  return `${trimmed}\nON CONFLICT ("${conflictColumn}") DO UPDATE SET\n  ${setClause};`;
}

function ensureTrailingSemicolon(sql: string): string {
  return sql.endsWith(";") ? sql : `${sql};`;
}

async function main() {
  const conflictColumn = parseConflictColumn(process.argv.slice(2));
  const raw = await readFile(SQL_PATH, "utf8");
  const sqlBody = stripSqlComments(raw);

  if (!sqlBody) {
    throw new Error(
      `${SQL_PATH} is empty (only comments). Paste SQL from Supabase and try again.`,
    );
  }

  const rowCount = countValueTuples(sqlBody);
  const sql = conflictColumn
    ? withOnConflictUpsert(sqlBody, conflictColumn)
    : ensureTrailingSemicolon(sqlBody);

  console.log(`Seeding from ${SQL_PATH}`);
  if (rowCount > 0) {
    console.log(`Detected ~${rowCount} VALUES row(s).`);
  }
  if (conflictColumn) {
    console.log(`Applying upsert on conflict ("${conflictColumn}")…`);
  } else {
    console.log("Executing SQL as-is (no --conflict).");
  }

  const affected = await prisma.$executeRawUnsafe(sql);

  console.log(`Done. Postgres reported ${affected} row(s) affected.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed from SQL:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
