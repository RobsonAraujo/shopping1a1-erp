/**
 * Diagnóstico (só leitura no ML) das etiquetas dos pedidos pagos de um mês —
 * confirma a regra de "devolvido" do DRE.
 *
 * O DRE tratava todo pedido pago com a etiqueta `not_delivered` como devolvido
 * (fora do Custo produto e dos Impostos, dentro de Canceladas). Mas o ML usa
 * `not_delivered` para qualquer pedido ainda não entregue — inclusive os em
 * trânsito. A regra nova só conta `not_delivered` com 30 dias ou mais. Este
 * script mostra, para um mês real, quantos pedidos cada regra pegaria e de
 * que idade eles são.
 *
 * Uso:
 *   npx tsx scripts/dre-order-tags-debug.ts <ano> <mês> [mlUserId]
 *
 * Precisa de DATABASE_URL, ENCRYPTION_KEY e credenciais ML no banco (como o
 * `dre:billing-debug`).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/db";
import {
  fetchPaidOrdersByPeriod,
  returnedPaidOrderIdsFromOrders,
} from "../src/lib/mercadolibre/api";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";
import { getCalendarMonthRange } from "../src/lib/mercadolibre/revenue-periods";
import { fromDbSellerId } from "../src/lib/mercadolibre/seller-id";
import type { OrderSearchOrder } from "../src/lib/mercadolibre/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function orderRevenue(order: OrderSearchOrder): number {
  return (order.order_items ?? []).reduce(
    (sum, line) =>
      sum + (Number(line.unit_price) || 0) * (Number(line.quantity) || 0),
    0,
  );
}

function ageDays(order: OrderSearchOrder, now: Date): number | null {
  const raw = order.date_closed || order.date_created;
  if (!raw) return null;
  return (now.getTime() - new Date(raw).getTime()) / DAY_MS;
}

async function resolveMlUserId(explicit?: string): Promise<number> {
  if (explicit) return Number(explicit);
  const row = await prisma.mlSellerCredentials.findFirst({
    select: { mlUserId: true },
  });
  if (!row) throw new Error("No ml_seller_credentials row found.");
  return fromDbSellerId(row.mlUserId);
}

async function main() {
  const year = Number(process.argv[2]);
  const month = Number(process.argv[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Uso: npx tsx scripts/dre-order-tags-debug.ts <ano> <mês> [mlUserId]");
  }
  const sellerId = await resolveMlUserId(process.argv[4]);
  const token = await resolveSellerAccessToken(sellerId);
  if (!token) throw new Error(`Sem token para o seller ${sellerId}`);

  const range = getCalendarMonthRange(year, month);
  const orders = await fetchPaidOrdersByPeriod(token, sellerId, range.from, range.to);
  const now = new Date();
  const money = (n: number) =>
    `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const buckets = new Map<string, { count: number; revenue: number }>();
  const add = (key: string, order: OrderSearchOrder) => {
    const row = buckets.get(key) ?? { count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += orderRevenue(order);
    buckets.set(key, row);
  };

  for (const order of orders) {
    const tags = (order.tags ?? []).map(String);
    const age = ageDays(order, now);
    const ageLabel =
      age === null ? "sem data" : age < 7 ? "<7d" : age < 15 ? "7–15d" : age < 30 ? "15–30d" : "≥30d";
    if (tags.includes("not_delivered")) add(`not_delivered ${ageLabel}`, order);
    if (tags.includes("delivered")) add("delivered", order);
    if (tags.includes("returned")) add("returned", order);
    if ((order.payments ?? []).some((p) => p.status === "refunded" || p.status === "charged_back")) {
      add("pagamento refunded/charged_back", order);
    }
    if (order.order_request?.return) add("order_request.return", order);
  }

  const oldRule = orders.filter((order) => {
    if (order.order_request?.return) return true;
    const tags = (order.tags ?? []).map(String);
    if (tags.includes("not_delivered") || tags.includes("returned")) return true;
    return (order.payments ?? []).some((p) => p.status === "refunded" || p.status === "charged_back");
  });
  const newRuleIds = returnedPaidOrderIdsFromOrders(orders, now);
  const newRule = orders.filter((order) => newRuleIds.has(String(order.id)));

  console.log(`Pedidos pagos de ${String(month).padStart(2, "0")}/${year}: ${orders.length} (${money(orders.reduce((s, o) => s + orderRevenue(o), 0))})`);
  for (const [key, row] of [...buckets.entries()].sort()) {
    console.log(`  ${key.padEnd(34)} ${String(row.count).padStart(5)}  ${money(row.revenue)}`);
  }
  console.log(
    `\nRegra antiga (not_delivered em qualquer idade): ${oldRule.length} pedidos, ${money(oldRule.reduce((s, o) => s + orderRevenue(o), 0))} fora do Custo produto/Impostos`,
  );
  console.log(
    `Regra nova (not_delivered só com 30+ dias):     ${newRule.length} pedidos, ${money(newRule.reduce((s, o) => s + orderRevenue(o), 0))}`,
  );
  console.log(
    "\nSe a maior parte dos not_delivered for recente (<7d / 7–15d), são pedidos em trânsito — a regra antiga os tirava do custo e do imposto.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
