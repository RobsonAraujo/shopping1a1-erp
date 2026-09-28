import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Guard-rail do bug de 28/09/2026: ids de vendedor do Mercado Livre passaram de
 * 2^31 e as colunas eram `INTEGER`, então o callback OAuth quebrava com
 * "value out of range for the type integer" e nenhuma conta ML nova conseguia
 * se cadastrar. Estes testes falham se alguém reintroduzir `Int` nessas colunas
 * — inclusive num modelo ou migration novos.
 */

const REPO_ROOT = process.cwd();
const SCHEMA_PATH = path.join(REPO_ROOT, "prisma/schema.prisma");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "prisma/migrations");

/** Migration que fez int4 -> int8. Só migrations posteriores a ela são cobradas. */
const BIGINT_MIGRATION = "20260928143000_seller_ids_bigint";

const SELLER_ID_FIELD_NAMES = new Set(["sellerId", "mlUserId"]);
const SELLER_ID_COLUMN_NAMES = new Set(["seller_id", "ml_user_id"]);

type SchemaField = { model: string; field: string; type: string; line: number };

function parseSellerIdFields(schema: string): SchemaField[] {
  const found: SchemaField[] = [];
  let currentModel: string | null = null;

  schema.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();

    const modelStart = /^model\s+(\w+)\s*\{/.exec(line);
    if (modelStart) {
      currentModel = modelStart[1];
      return;
    }
    if (line === "}") {
      currentModel = null;
      return;
    }
    if (!currentModel || line.startsWith("//") || line.startsWith("@@")) return;

    const field = /^(\w+)\s+(\w+)/.exec(line);
    if (!field) return;

    const [, fieldName, fieldType] = field;
    const mapped = /@map\("(\w+)"\)/.exec(line);
    const isSellerId =
      SELLER_ID_FIELD_NAMES.has(fieldName) ||
      (mapped !== null && SELLER_ID_COLUMN_NAMES.has(mapped[1]));

    if (isSellerId) {
      found.push({
        model: currentModel,
        field: fieldName,
        type: fieldType,
        line: index + 1,
      });
    }
  });

  return found;
}

describe("seller id columns stay BigInt", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const fields = parseSellerIdFields(schema);

  it("encontra os campos de seller id no schema", () => {
    // Se este número cair, o parser quebrou (ou alguém renomeou um campo) e os
    // outros testes passariam sem checar nada.
    assert.ok(
      fields.length >= 6,
      `esperava ao menos 6 campos de seller id, achei ${fields.length}`,
    );
  });

  it("nenhum campo de seller id é Int", () => {
    const offenders = fields.filter((f) => f.type !== "BigInt");
    assert.deepEqual(
      offenders,
      [],
      "Ids de vendedor do ML passam de 2^31 (ex.: 3711648215) e não cabem em " +
        "INTEGER — voltar para `Int` quebra o signup de toda conta ML nova. " +
        `Use BigInt: ${offenders.map((f) => `${f.model}.${f.field}:${f.line}`).join(", ")}`,
    );
  });

  it("nenhuma migration posterior recria a coluna como INTEGER", () => {
    const later = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name > BIGINT_MIGRATION)
      .map((entry) => entry.name);

    const offenders: string[] = [];
    for (const dir of later) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
      for (const column of SELLER_ID_COLUMN_NAMES) {
        if (new RegExp(`"${column}"\\s+INTEGER`, "i").test(sql)) {
          offenders.push(`${dir} (${column})`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `migration criando coluna de seller id como INTEGER: ${offenders.join(", ")}`,
    );
  });
});
