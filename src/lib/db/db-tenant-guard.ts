import { Prisma } from "@/generated/prisma";

/**
 * Modelos cujas queries já foram escopadas por `organizationId` (ver
 * docs/architecture/tenant-data-model.md). Só entra aqui depois que TODO
 * ponto de leitura em lote do modelo já passa `organizationId` no `where`,
 * senão o guard quebra features que hoje funcionam.
 */
const TENANT_SCOPED_MODELS = new Set([
  "Product",
  "CompanyTaxSettings",
  "KitItem",
  "DreProductCostLeveling",
  "DreCostItem",
  "Listing",
  "WarehouseStock",
  "SalesWindowSnapshot",
  "ReplenishmentCycle",
  "FullShipment",
  "Kit",
  "TaxFixedCostItem",
  "TaxFixedCostMonthValue",
  "TaxFixedCostMonthExclusion",
  "CatalogCompetitionSnapshot",
  "CatalogCompetitionPollRun",
  "DreMonthSnapshot",
  "DreCostMonthValue",
  "DreReconciliationImport",
  "DreReconciliationEntry",
  "TaxReportSimulationSnapshot",
  "SimplesRevenueMonthSnapshot",
  "KanbanColumn",
  "KanbanBoardSettings",
]);

/**
 * `TaxReportMonthSnapshot` e `RevenueSimulation` ficam de fora de propósito:
 * são escopadas por `sellerId` (não `organizationId`), um proxy válido — 1
 * seller ML pertence a no máximo 1 org (`OrganizationMlSeller.mlUserId` é
 * @unique). Ver docs/architecture/tenant-data-model.md ("Parcial ML").
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
 * Decisão pura (sem I/O) de se uma chamada precisa de `organizationId` no
 * `where` — extraída da extensão do Prisma abaixo pra ser testável sem
 * precisar de um client/DB de verdade.
 */
export function requiresOrganizationFilter(
  model: string,
  operation: string,
): boolean {
  return TENANT_SCOPED_MODELS.has(model) && BULK_OPS.has(operation);
}

/** `true` se `where` é um objeto com a chave `organizationId` (qualquer valor). */
export function hasOrganizationFilter(where: unknown): boolean {
  return typeof where === "object" && where !== null && "organizationId" in where;
}

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
          if (requiresOrganizationFilter(model, operation)) {
            const where = (args as { where?: Record<string, unknown> }).where;
            if (!hasOrganizationFilter(where)) {
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
