/**
 * Etapa 2 da migração de identidade de produto pra produção (ver runbook em
 * /Users/robsonaraujocarmo/.claude/plans/nos-temos-um-problema-rustling-harp.md).
 *
 * Roda DEPOIS da migration aditiva (`20260902023442_add_product_ml_item_id_additive`
 * — `Product.mlItemId` nullable) e ANTES da migration destrutiva
 * (`20260902023947_product_identity_is_ml_item_id` — que torna `mlItemId` a
 * PK e remove `product_sku_aliases`). Nesse ponto o schema ainda tem `Product.id`
 * (cuid), `sku` único, e a tabela `product_sku_aliases` intacta.
 *
 * Usa SQL cru (não o client tipado) DE PROPÓSITO: este script opera contra
 * um ponto específico e transitório do histórico do schema — diferente do
 * schema.prisma atual do repo (que já está no estado final, pós-destrutiva)
 * — então não há um Prisma Client gerado que descreva corretamente as duas
 * pontas ao mesmo tempo. SQL cru evita a dependência de tipo, o script
 * continua funcionando não importa em que ponto do histórico do repo ele
 * for rodado.
 *
 * Não existe (e não deve existir) uma tabela de vínculo intermediária tipo
 * `ProductIdentityLink` — produção nunca teve essa tabela (foi criada e
 * removida só dentro da sessão de dev). O match é direto: busca os anúncios
 * ao vivo do vendedor, casa por texto de SKU (usando `ProductSkuAlias` já
 * cadastrado como sinal extra), e grava `mlItemId`.
 *
 * Regras:
 *   - Product cujo SKU (ou um alias que aponta pra ele) bate com exatamente
 *     1 anúncio ao vivo: grava `mlItemId` direto.
 *   - Product que bate com 2+ anúncios: mantém um (prioriza `active` sobre
 *     `paused`) na linha original; cria uma linha nova de Product por
 *     anúncio extra, duplicando os campos de custo/imposto — sob o modelo
 *     novo, 1 MLB = 1 Product, sem merge. A linha nova nasce com um SKU
 *     provisório (`<sku original> (split <mlItemId>)`) porque o SKU ainda é
 *     único nesta fase — vira cosmético assim que a migration destrutiva
 *     rodar, dá pra renomear depois.
 *   - Product sem match nos anúncios `active`/`paused`: tenta de novo contra
 *     `closed` (cobre produto descontinuado com histórico de venda).
 *   - Ainda sem match: fica pendente, reportado no fim — NADA é apagado
 *     automaticamente. Decida caso a caso antes de aplicar a migration
 *     destrutiva (ela exige `mlItemId` obrigatório em toda linha).
 *
 * Idempotente: só processa Product com `mlItemId` ainda nulo, seguro rodar
 * de novo quantas vezes precisar.
 *
 * Uso:
 *   npx tsx scripts/backfill-product-ml-item-id.ts                     # dry-run (padrão)
 *   npx tsx scripts/backfill-product-ml-item-id.ts --apply
 *   npx tsx scripts/backfill-product-ml-item-id.ts --apply --org <organizationId>
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import { fetchOperationalListings, fetchAllUserItemIds, fetchItemsByIdsBatched } from "../src/lib/mercadolibre/api";
import { resolveSellerAccessToken } from "../src/lib/mercadolibre/persist-seller-tokens";
import { getItemSku } from "../src/lib/mercadolibre/item-sku";
import { normalizeProductSku } from "../src/lib/product-pricing";
import type { ItemBody } from "../src/lib/mercadolibre/types";

type ProductRow = {
  id: string;
  sku: string | null;
  ncm: string | null;
  unit_cost_nf: Prisma.Decimal;
  purchase_icms_percent: Prisma.Decimal;
  has_icms_st: boolean;
  purchase_cost_with_st: Prisma.Decimal | null;
  ipi_percent: Prisma.Decimal;
  extra_costs: Prisma.Decimal;
  is_monophasic: boolean;
  sale_icms_percent: Prisma.Decimal;
  is_imported: boolean;
  pma_price: Prisma.Decimal | null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
    orgId: (() => {
      const idx = args.indexOf("--org");
      return idx === -1 ? undefined : args[idx + 1];
    })(),
  };
}

/** Prioriza active > paused > qualquer outro status ao escolher qual anúncio vira a linha "primária" num match de 2+. */
function pickPrimary(items: ItemBody[]): ItemBody {
  const active = items.find((i) => i.status === "active");
  if (active) return active;
  const paused = items.find((i) => i.status === "paused");
  if (paused) return paused;
  return items[0];
}

async function main() {
  const { apply, orgId } = parseArgs();
  console.log(
    apply
      ? "MODO APPLY — vai gravar no banco.\n"
      : "MODO DRY-RUN — nada será gravado (use --apply para gravar de fato).\n",
  );

  const sellers = await prisma.$queryRaw<{ organization_id: string; ml_user_id: number }[]>(
    orgId
      ? Prisma.sql`SELECT organization_id, ml_user_id FROM organization_ml_sellers WHERE organization_id = ${orgId}`
      : Prisma.sql`SELECT organization_id, ml_user_id FROM organization_ml_sellers`,
  );
  if (sellers.length === 0) {
    console.error("Nenhuma organização com vendedor ML vinculado encontrada.");
    process.exit(1);
  }

  let totalDirect = 0;
  let totalSplit = 0;
  let totalPending = 0;

  for (const seller of sellers) {
    const orgRows = await prisma.$queryRaw<{ name: string }[]>(
      Prisma.sql`SELECT name FROM organizations WHERE id = ${seller.organization_id}`,
    );
    const label = `${orgRows[0]?.name ?? seller.organization_id} (${seller.organization_id})`;

    const products = await prisma.$queryRaw<ProductRow[]>(
      Prisma.sql`SELECT id, sku, ncm, unit_cost_nf, purchase_icms_percent, has_icms_st,
        purchase_cost_with_st, ipi_percent, extra_costs, is_monophasic, sale_icms_percent,
        is_imported, pma_price
        FROM products WHERE organization_id = ${seller.organization_id} AND ml_item_id IS NULL`,
    );
    if (products.length === 0) {
      console.log(`## ${label} — nenhum produto pendente, pulando.`);
      continue;
    }

    const resolvedToken = await resolveSellerAccessToken(seller.ml_user_id);
    if (!resolvedToken) {
      console.log(`## ${label} — sem token OAuth válido, pulando (${products.length} produtos ficam pendentes).`);
      totalPending += products.length;
      continue;
    }
    const token: string = resolvedToken;

    const aliasRows = await prisma.$queryRaw<{ alias_sku: string; canonical_sku: string }[]>(
      Prisma.sql`SELECT alias_sku, canonical_sku FROM product_sku_aliases WHERE organization_id = ${seller.organization_id}`,
    );
    const canonicalBySkuText = new Map(aliasRows.map((r) => [r.alias_sku, r.canonical_sku]));

    console.log(`## ${label} — ${products.length} produtos pendentes`);

    const activePaused = await fetchOperationalListings(token, seller.ml_user_id, seller.organization_id);
    const itemsBySku = new Map<string, ItemBody[]>();
    function indexItems(items: ItemBody[]) {
      for (const item of items) {
        const raw = getItemSku(item);
        if (!raw) continue;
        const normalized = normalizeProductSku(raw);
        const canonical = canonicalBySkuText.get(normalized) ?? normalized;
        const list = itemsBySku.get(canonical) ?? [];
        if (!list.some((i) => i.id === item.id)) list.push(item);
        itemsBySku.set(canonical, list);
      }
    }
    indexItems(activePaused);

    let closedFetched = false;
    async function ensureClosedFetched() {
      if (closedFetched) return;
      closedFetched = true;
      const closedIds = await fetchAllUserItemIds(token, seller.ml_user_id, { status: "closed" });
      const closedItems = await fetchItemsByIdsBatched(token, closedIds);
      indexItems(closedItems);
    }

    for (const product of products) {
      const sku = product.sku ? normalizeProductSku(product.sku) : "";
      let matches = sku ? (itemsBySku.get(sku) ?? []) : [];

      if (matches.length === 0) {
        await ensureClosedFetched();
        matches = sku ? (itemsBySku.get(sku) ?? []) : [];
      }

      if (matches.length === 0) {
        totalPending++;
        console.log(`  PENDENTE (sem match ao vivo, nem em closed): sku="${product.sku}" id=${product.id}`);
        continue;
      }

      const primary = pickPrimary(matches);
      const extra = matches.filter((m) => m.id !== primary.id);

      totalDirect++;
      console.log(`  direto: sku="${product.sku}" -> mlItemId=${primary.id}`);
      if (apply) {
        await prisma.$executeRaw(
          Prisma.sql`UPDATE products SET ml_item_id = ${primary.id} WHERE id = ${product.id}`,
        );
      }

      for (const item of extra) {
        totalSplit++;
        const splitSku = `${product.sku} (split ${item.id})`;
        console.log(`  split: sku="${product.sku}" -> novo Product mlItemId=${item.id} sku provisório="${splitSku}"`);
        if (apply) {
          await prisma.$executeRaw(
            Prisma.sql`INSERT INTO products (
              id, organization_id, sku, ml_item_id, ncm, unit_cost_nf, purchase_icms_percent,
              has_icms_st, purchase_cost_with_st, ipi_percent, extra_costs, is_monophasic,
              sale_icms_percent, is_imported, pma_price, created_at, updated_at
            ) VALUES (
              gen_random_uuid()::text, ${seller.organization_id}, ${splitSku}, ${item.id},
              ${product.ncm}, ${product.unit_cost_nf}, ${product.purchase_icms_percent},
              ${product.has_icms_st}, ${product.purchase_cost_with_st}, ${product.ipi_percent},
              ${product.extra_costs}, ${product.is_monophasic}, ${product.sale_icms_percent},
              ${product.is_imported}, ${product.pma_price}, now(), now()
            )`,
          );
        }
      }
    }

    // KitItem/DreProductCostLeveling ainda referenciam Product por
    // (organizationId, sku) nesta fase — join direto pra preencher
    // productMlItemId antes da migration destrutiva exigir NOT NULL. Linha
    // cujo sku não bate com nenhum Product (produto splitado com sku
    // provisório, ou produto que ficou pendente/foi removido) não é tocada
    // aqui — fica reportada como pendência à parte, não é a mesma lista dos
    // Products pendentes.
    if (apply) {
      const kitResult = await prisma.$executeRaw(Prisma.sql`
        UPDATE kit_items ki SET product_ml_item_id = p.ml_item_id
        FROM products p
        WHERE p.organization_id = ki.organization_id AND p.sku = ki.sku
          AND ki.organization_id = ${seller.organization_id} AND ki.product_ml_item_id IS NULL
      `);
      const levelingResult = await prisma.$executeRaw(Prisma.sql`
        UPDATE dre_product_cost_levelings dl SET product_ml_item_id = p.ml_item_id
        FROM products p
        WHERE p.organization_id = dl.organization_id AND p.sku = dl.sku
          AND dl.organization_id = ${seller.organization_id} AND dl.product_ml_item_id IS NULL
      `);
      console.log(`  kit_items atualizados: ${kitResult} | dre_product_cost_levelings atualizados: ${levelingResult}`);
    }

    const pendingKitItems = await prisma.$queryRaw<{ kit_id: string; sku: string }[]>(Prisma.sql`
      SELECT kit_id, sku FROM kit_items WHERE organization_id = ${seller.organization_id} AND product_ml_item_id IS NULL
    `);
    const pendingLevelings = await prisma.$queryRaw<{ id: string; sku: string }[]>(Prisma.sql`
      SELECT id, sku FROM dre_product_cost_levelings WHERE organization_id = ${seller.organization_id} AND product_ml_item_id IS NULL
    `);
    for (const row of pendingKitItems) {
      console.log(`  PENDENTE kit_item: kit=${row.kit_id} sku="${row.sku}" (sem Product correspondente)`);
    }
    for (const row of pendingLevelings) {
      console.log(`  PENDENTE dre_product_cost_leveling: id=${row.id} sku="${row.sku}" (sem Product correspondente)`);
    }
  }

  console.log("\n--- resumo ---");
  console.log("produtos migrados direto:", totalDirect);
  console.log("produtos splitados (linhas novas criadas):", totalSplit);
  console.log("produtos pendentes (sem match, revisar antes da migration destrutiva):", totalPending);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
