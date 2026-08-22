import { Prisma } from "@/generated/prisma";

/**
 * Modelos cujas queries já foram escopadas por `organizationId` (ver
 * docs/architecture/saas-migration.md). Cresce conforme mais módulos da
 * Fase 5 forem escopados — só entra aqui depois que TODO ponto de leitura em
 * lote do modelo já passa `organizationId` no `where`, senão o guard quebra
 * features que hoje funcionam (mesmo sem isolamento real ainda).
 */
const TENANT_SCOPED_MODELS = new Set([
  "Product",
  "CompanyTaxSettings",
  "ProductSkuAlias",
  "KitItem",
  "DreProductCostLeveling",
  "DreCostItem",
  "Listing",
  "WarehouseStock",
  "ReplenishmentCycle",
  "FullShipment",
  "Kit",
  "StockAttentionAcknowledgement",
  "TaxFixedCostItem",
  "TaxFixedCostMonthValue",
  "TaxFixedCostMonthExclusion",
  "CatalogCompetitionSnapshot",
  "CatalogCompetitionPollRun",
  "DreMonthSnapshot",
  "DreCostMonthValue",
]);

/**
 * `TaxReportMonthSnapshot` e `RevenueSimulation` ficam de fora de propósito:
 * são escopadas por `sellerId` (não `organizationId`), um proxy válido — 1
 * seller ML pertence a no máximo 1 org (`OrganizationMlSeller.mlUserId` é
 * @unique). Ver docs/architecture/saas-migration.md ("Parcial ML").
 */

/** Operações em lote — onde "esqueci o filtro" pode vazar/apagar N linhas de outra org de uma vez. */
const BULK_OPS = new Set([
  "findMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Guard-rail sempre ativo (dev/CI/prod): lança erro se uma operação em lote
 * sobre um modelo escopado não tiver `organizationId` no `where` de topo.
 * Não reescreve a query — só recusa esquecimento. Complementa (não
 * substitui) a proteção de schema do Grupo A (FK composta `[organizationId,
 * sku]`, que torna vazamento cross-tenant fisicamente impossível via join).
 */
export const tenantGuardExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model) && BULK_OPS.has(operation)) {
            const where = (args as { where?: Record<string, unknown> }).where;
            if (!where || !("organizationId" in where)) {
              throw new Error(
                `[tenant-guard] ${model}.${operation} chamado sem organizationId no where — risco de vazamento cross-tenant.`,
              );
            }
          }
          return query(args);
        },
      },
    },
  }),
);
