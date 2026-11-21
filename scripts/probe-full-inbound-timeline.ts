/**
 * Fase 0 do estoque automático, parte 2 (só leitura): como um envio do
 * vendedor ao Full aparece nas operações de estoque do ML. Decide em que
 * evento o galpão deve baixar (recebimento × transferência) sem baixa dupla.
 *
 * Para cada envio (inbound) dos meses pedidos, pega no faturamento do Full
 * (`billing .../group/ML/full/details`) os `inventory_id` e quantidades, e
 * lista as operações do Full desses inventários numa janela em volta da data:
 * quais tipos citam o `inbound_id` do envio, em que ordem, e se aparecem
 * `TRANSFER_RESERVATION` (status "transfer") antes ou depois.
 *
 * Uso:
 *   npx tsx scripts/probe-full-inbound-timeline.ts                 # out e nov/2026, até 3 envios
 *   npx tsx scripts/probe-full-inbound-timeline.ts 2026-10 2026-11 --max=4
 *   npx tsx scripts/probe-full-inbound-timeline.ts --inventories=LILE67990,DIEO60679 --from=2026-09-25 --to=2026-11-21
 *     (pula o faturamento e lista as operações desses inventários na janela)
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/lib/db/db";
import { getMercadoLibreConfig } from "../src/lib/mercadolibre/config";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";
import { fromDbSellerId } from "../src/lib/mercadolibre/seller-id";
import { billingPeriodKey } from "../src/lib/mercadolibre/billing-shared";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

async function getJson(url: string, token: string): Promise<{ status: number; body: unknown }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const text = await res.text();
    // O billing devolve o 429 embrulhado num 400 ("Http status error with code 429").
    const throttled = res.status === 429 || res.status >= 500 || (res.status === 400 && text.includes("429"));
    if (throttled) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text };
    }
  }
  return { status: 0, body: "falhou após 6 tentativas" };
}

type InboundLine = { inboundId: string; inventoryId: string; quantity: number; date: string | null; itemId: string | null; type: string | null };

async function fullBillingLines(token: string, year: number, month: number): Promise<InboundLine[]> {
  const { apiBase } = getMercadoLibreConfig();
  const key = billingPeriodKey(year, month);
  const out: InboundLine[] = [];
  let fromId = 0;
  for (let page = 0; page < 30; page += 1) {
    const u = new URL(`${apiBase}/billing/integration/periods/key/${key}/group/ML/full/details`);
    u.searchParams.set("document_type", "BILL");
    u.searchParams.set("limit", "1000");
    u.searchParams.set("from_id", String(fromId));
    const res = await getJson(u.toString(), token);
    const body = asRecord(res.body);
    const results = Array.isArray(body?.results) ? body.results : [];
    if (res.status !== 200) {
      console.log(`billing ${key} HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
      break;
    }
    for (const raw of results) {
      const row = asRecord(raw) ?? {};
      const info = asRecord(row.fulfillment_info) ?? {};
      const charge = asRecord(row.charge_info) ?? {};
      const inboundId = info.inbound_id != null ? String(info.inbound_id) : null;
      const inventoryId = typeof info.inventory_id === "string" ? info.inventory_id : null;
      if (!inboundId || !inventoryId) continue;
      out.push({
        inboundId,
        inventoryId,
        quantity: typeof info.quantity === "number" ? info.quantity : 0,
        date: typeof charge.creation_date_time === "string" ? charge.creation_date_time : null,
        itemId: typeof info.item_id === "string" ? info.item_id : null,
        type: typeof info.type === "string" ? info.type : null,
      });
    }
    const lastId = body?.last_id;
    if (results.length < 1000 || typeof lastId !== "number") break;
    fromId = lastId;
  }
  return out;
}

async function main() {
  const months = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  const maxArg = process.argv.find((a) => a.startsWith("--max="));
  const maxInbounds = maxArg ? Number(maxArg.slice(6)) || 3 : 3;
  const targets = (months.length > 0 ? months : ["2026-10", "2026-11"]).map((m) => {
    const [y, mo] = m.split("-").map(Number);
    return { year: y, month: mo };
  });

  const cred = await prisma.mlSellerCredentials.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!cred) throw new Error("Sem ml_seller_credentials.");
  const sellerId = fromDbSellerId(cred.mlUserId);
  const token = await resolveSellerAccessToken(sellerId);
  if (!token) throw new Error("Sem access token.");
  const { apiBase } = getMercadoLibreConfig();

  const inventoriesArg = process.argv.find((a) => a.startsWith("--inventories="));
  if (inventoriesArg) {
    const fromArg = process.argv.find((a) => a.startsWith("--from="))?.slice(7) ?? new Date(Date.now() - 55 * 86_400_000).toISOString().slice(0, 10);
    const toArg = process.argv.find((a) => a.startsWith("--to="))?.slice(5) ?? new Date().toISOString().slice(0, 10);
    const direct: unknown[] = [];
    for (const inventoryId of inventoriesArg.slice(14).split(",").filter(Boolean)) {
      const ops: Json[] = [];
      let scroll: string | null = null;
      for (let page = 0; page < 20; page += 1) {
        const u = new URL(`${apiBase}/stock/fulfillment/operations/search`);
        u.searchParams.set("seller_id", String(sellerId));
        u.searchParams.set("inventory_id", inventoryId);
        u.searchParams.set("date_from", fromArg);
        u.searchParams.set("date_to", toArg);
        u.searchParams.set("limit", "1000");
        if (scroll) u.searchParams.set("scroll", scroll);
        const res = await getJson(u.toString(), token);
        if (res.status !== 200) {
          console.log(`  ${inventoryId} HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
          break;
        }
        const body = asRecord(res.body);
        ops.push(...(Array.isArray(body?.results) ? body.results : []).map((r) => asRecord(r) ?? {}));
        const next = asRecord(body?.paging)?.scroll;
        scroll = typeof next === "string" && next ? next : null;
        if (!scroll) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      ops.sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
      const types: Record<string, number> = {};
      const qtyByType: Record<string, number> = {};
      for (const op of ops) {
        const t = String(op.type);
        types[t] = (types[t] ?? 0) + 1;
        qtyByType[t] = (qtyByType[t] ?? 0) + Number(asRecord(op.detail)?.available_quantity ?? 0);
      }
      console.log(`\n=== inv ${inventoryId} ${fromArg}..${toArg}: ${ops.length} operações ${JSON.stringify(types)}`);
      console.log(`    soma de available_quantity por tipo: ${JSON.stringify(qtyByType)}`);
      const inboundRefs = new Map<string, { types: Set<string>; qty: number; first: string; last: string }>();
      for (const op of ops) {
        for (const ref of Array.isArray(op.external_references) ? op.external_references : []) {
          const r = asRecord(ref);
          if (r?.type !== "inbound_id") continue;
          const id = String(r.value);
          const cur = inboundRefs.get(id) ?? { types: new Set<string>(), qty: 0, first: String(op.date_created), last: String(op.date_created) };
          cur.types.add(String(op.type));
          cur.qty += Number(asRecord(op.detail)?.available_quantity ?? 0);
          cur.last = String(op.date_created);
          inboundRefs.set(id, cur);
        }
      }
      console.log(`    inbound_ids citados: ${inboundRefs.size}`);
      for (const [id, v] of [...inboundRefs.entries()].sort((a, b) => a[1].first.localeCompare(b[1].first))) {
        console.log(`      ${id} tipos=${JSON.stringify([...v.types])} qtd=${v.qty} ${v.first} → ${v.last}`);
      }
      for (const op of ops.filter((op) => !String(op.type).startsWith("SALE_")).slice(0, 60)) {
        console.log(`    ${String(op.date_created)} ${String(op.type)} detail=${JSON.stringify(op.detail ?? null)} refs=${JSON.stringify(op.external_references ?? null)}`);
      }
      direct.push({ inventoryId, operations: ops });
      await new Promise((r) => setTimeout(r, 3000));
    }
    const outPathDirect = join(tmpdir(), "probe-full-inbound-timeline.json");
    writeFileSync(outPathDirect, JSON.stringify({ direct }, null, 2));
    console.log(`\nJSON completo em: ${outPathDirect}`);
    await prisma.$disconnect();
    return;
  }

  const lines: InboundLine[] = [];
  for (const t of targets) {
    const got = await fullBillingLines(token, t.year, t.month);
    console.log(`faturamento Full ${t.year}-${String(t.month).padStart(2, "0")}: ${got.length} linhas com inbound_id`);
    lines.push(...got);
  }
  const byInbound = new Map<string, InboundLine[]>();
  for (const l of lines) {
    const list = byInbound.get(l.inboundId) ?? [];
    list.push(l);
    byInbound.set(l.inboundId, list);
  }
  const inbounds = [...byInbound.entries()]
    .map(([id, ls]) => ({
      id,
      lines: ls,
      date: ls.map((l) => l.date).filter(Boolean).sort()[0] ?? null,
      types: [...new Set(ls.map((l) => l.type))],
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  console.log(`envios distintos: ${inbounds.length}`);
  for (const ib of inbounds.slice(0, 12)) {
    const inv = [...new Set(ib.lines.map((l) => l.inventoryId))];
    console.log(`  ${ib.id} data=${ib.date} tipos=${JSON.stringify(ib.types)} inventários=${inv.length} qtd(faturamento)=${ib.lines.reduce((s, l) => s + l.quantity, 0)}`);
  }

  const report: unknown[] = [];
  for (const ib of inbounds.slice(0, maxInbounds)) {
    const center = ib.date ? new Date(ib.date) : new Date();
    const from = new Date(center.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
    const toDate = new Date(Math.min(Date.now(), center.getTime() + 25 * 86_400_000));
    const to = toDate.toISOString().slice(0, 10);
    const inventories = [...new Set(ib.lines.map((l) => l.inventoryId))].slice(0, 2);
    console.log(`\n=== envio ${ib.id} (${ib.date}) · janela ${from}..${to}`);
    for (const inventoryId of inventories) {
      const ops: Json[] = [];
      let scroll: string | null = null;
      for (let page = 0; page < 20; page += 1) {
        const u = new URL(`${apiBase}/stock/fulfillment/operations/search`);
        u.searchParams.set("seller_id", String(sellerId));
        u.searchParams.set("inventory_id", inventoryId);
        u.searchParams.set("date_from", from);
        u.searchParams.set("date_to", to);
        u.searchParams.set("limit", "1000");
        if (scroll) u.searchParams.set("scroll", scroll);
        const res = await getJson(u.toString(), token);
        if (res.status !== 200) {
          console.log(`  ${inventoryId} HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
          break;
        }
        const body = asRecord(res.body);
        ops.push(...(Array.isArray(body?.results) ? body.results : []).map((r) => asRecord(r) ?? {}));
        const next = asRecord(body?.paging)?.scroll;
        scroll = typeof next === "string" && next ? next : null;
        if (!scroll) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      ops.sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
      const refsInbound = (op: Json) =>
        (Array.isArray(op.external_references) ? op.external_references : []).some(
          (r) => asRecord(r)?.type === "inbound_id" && String(asRecord(r)?.value) === ib.id,
        );
      const billed = ib.lines.filter((l) => l.inventoryId === inventoryId).reduce((s, l) => s + l.quantity, 0);
      const types: Record<string, number> = {};
      for (const op of ops) types[String(op.type)] = (types[String(op.type)] ?? 0) + 1;
      const mine = ops.filter(refsInbound);
      const sumMine = mine.reduce((s, op) => s + Number(asRecord(op.detail)?.available_quantity ?? 0), 0);
      console.log(`  inv ${inventoryId}: ${ops.length} operações ${JSON.stringify(types)} · citam o envio: ${mine.length} (tipos ${JSON.stringify([...new Set(mine.map((op) => op.type))])}, soma disponível ${sumMine}) · faturado ${billed}`);
      for (const op of ops.filter((op) => !String(op.type).startsWith("SALE_")).slice(0, 40)) {
        console.log(
          `    ${String(op.date_created)} ${String(op.type)}${refsInbound(op) ? " ← ESTE ENVIO" : ""} detail=${JSON.stringify(op.detail ?? null)} refs=${JSON.stringify(op.external_references ?? null)}`,
        );
      }
      report.push({ inboundId: ib.id, inventoryId, billed, operations: ops });
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const outPath = join(tmpdir(), "probe-full-inbound-timeline.json");
  writeFileSync(outPath, JSON.stringify({ inbounds: inbounds.slice(0, 20), report }, null, 2));
  console.log(`\nJSON completo em: ${outPath}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
