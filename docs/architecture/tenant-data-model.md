# Modelo de dados do tenant (estado atual)

A migração para SaaS multi-tenant está **concluída** (fases 0-7). Este documento descreve como o modelo funciona hoje e as convenções a seguir em código novo — não é mais um plano de migração. Referência rápida de escala: [saas-scale-triggers.md](saas-scale-triggers.md).

## Modelo de produto

- **Organization** = cliente que paga pelo ERP
- **User** = pessoa com acesso ao ERP (schema pronto para vários por organização; hoje só o dono existe, criado automaticamente no primeiro login OAuth)
- **OrganizationMlSeller** = vínculo entre uma organização e uma conta Mercado Livre (`mlUserId` é `@unique` — 1 seller ML pertence a no máximo 1 organização)

**Login continua sendo só OAuth do Mercado Livre** — sem email/senha, sem SSO. `mlUserId` é a identidade de sessão; `requireOrganization()` (`src/lib/api/api-auth.ts`) resolve a organização a partir dele a cada request, via `OrganizationMlSeller`.

## Modelos Prisma (`prisma/schema.prisma`)

```prisma
model Organization {
  id              String             @id @default(cuid())
  name            String
  slug            String             @unique
  status          OrganizationStatus @default(trialing) // trialing | active | past_due | canceled
  statusUpdatedAt DateTime           @default(now())
  statusNote      String?
  members         OrganizationMember[]
  mlSellers       OrganizationMlSeller[]
}

model User {
  id    String  @id @default(cuid())
  email String? @unique // nullable — ML não garante e-mail; não usado pra login
  name  String?
  memberships OrganizationMember[]
}

model OrganizationMember {
  organizationId String
  userId         String
  role           OrganizationRole @default(owner) // owner | admin | member
  @@id([organizationId, userId])
}

model OrganizationMlSeller {
  organizationId          String
  mlUserId                Int
  isPrimary               Boolean   @default(true)
  lastCatalogCronPolledAt DateTime? // cursor de rotação do cron de catálogo
  @@id([organizationId, mlUserId])
  @@unique([mlUserId])
}
```

`MlSellerCredentials` (tokens OAuth criptografados, AES-256-GCM) permanece `@id mlUserId` — não é dado de tenant, é storage de credencial por seller.

## Gate de pagamento

`Organization.status` fora de `[trialing, active]` → `requireOrganization()` recusa com 402 antes de qualquer query de negócio ou chamada ao Mercado Livre (`src/lib/api/api-auth.ts`). Trocado manualmente hoje (rota `PATCH /api/admin/organizations/[id]/status` com `ADMIN_SECRET`, ou Prisma Studio) — gateway automático (Stripe/Mercado Pago escrevendo `status` via webhook) é a extensão natural quando isso for prioridade; a coluna já foi desenhada pra isso.

## Classificação das tabelas Prisma

| Classificação | Modelos |
|---|---|
| **Por tenant — `organizationId NOT NULL`, guard-rail ativo** (ver abaixo) | `Product`, `CompanyTaxSettings`, `KitItem`, `DreProductCostLeveling`, `DreCostItem`, `Listing`, `WarehouseStock`, `SalesWindowSnapshot`, `ReplenishmentCycle`, `FullShipment`, `Kit`, `TaxFixedCostItem`, `TaxFixedCostMonthValue`, `TaxFixedCostMonthExclusion`, `CatalogCompetitionSnapshot`, `CatalogCompetitionPollRun`, `DreMonthSnapshot`, `DreCostMonthValue`, `DreReconciliationImport`, `DreReconciliationEntry`, `TaxReportSimulationSnapshot`, `SimplesRevenueMonthSnapshot` |
| **Parcial ML** (`organizationId` existe e é `NOT NULL`, mas a chave de negócio/unique é `sellerId` — proxy de tenant válido, já que `mlUserId` é `@unique` em `OrganizationMlSeller`) | `TaxReportMonthSnapshot` (`sellerId`+`year`+`month`), `RevenueSimulation` (`sellerId`) |
| **Storage de token, keyed por `mlUserId`** (não é dado de tenant) | `MlSellerCredentials` |
| **Global** (referência nacional/pública, sem override por org) | `CbsIbsVigencia`, `TaxpayerVerificationCache`, `FlexDistanceTier`, `IcmsInternalRate` (PK `uf` — override por organização **não implementado ainda**, apesar de ter sido cogitado; se um cliente pedir alíquota interna diferente da tabela nacional, é preciso migration nova) |

## Guard-rail de isolamento (`src/lib/db/db-tenant-guard.ts`)

Prisma Client Extension sempre ativa (dev/CI/prod): lança erro se uma operação em **lote** (`findMany`/`updateMany`/`deleteMany`/`count`/`aggregate`/`groupBy`) sobre um modelo em `TENANT_SCOPED_MODELS` não tiver `organizationId` no `where` de topo. Não cobre `findUnique`/`findFirst`/`update`/`delete`/`create` de registro único — esses dependem de disciplina manual (ou, em alguns pontos, de um `mlItemId` que já é 1:1 com organização, ex. `WarehouseStock`/`ReplenishmentCycle`).

`TaxReportMonthSnapshot`/`RevenueSimulation` ficam de fora da lista de propósito (linha "Parcial ML" acima).

## Convenções obrigatórias em código novo

1. **Nunca criar singleton de negócio** (`id: "default"`, tabela sem `organizationId`) — o padrão antigo (`CompanyTaxSettings.id = "default"`) foi eliminado na migração; não regredir.
2. **Toda função nova em lib que toca modelo de negócio**: `organizationId` é o primeiro parâmetro, obrigatório (não opcional).
3. **Toda rota de API nova** que lê/escreve dado de negócio ou chama a API do ML: usar `requireOrganization()` (não `requireAuth()` puro).
4. **Toda query em lote nova** sobre modelo de negócio: incluir `organizationId` no `where`. Se o modelo for nativamente tenant-scoped, adicionar seu nome em `TENANT_SCOPED_MODELS` assim que TODAS as queries dele já filtrarem por org (senão o guard quebra em runtime).
5. **Testes**: usar `organizationId` de teste nas factories.

## Decisões fechadas

- Login do ERP: só OAuth do Mercado Livre. Sem email/senha, sem magic link, sem SSO.
- Um seller ML não pode pertencer a mais de uma org (`@@unique([mlUserId])` em `OrganizationMlSeller`).
- URL: organização implícita na sessão (sem `/org/[slug]/...` nem seletor de org na UI) — só faz sentido reconsiderar se/quando uma organização puder ter mais de um usuário ativo ao mesmo tempo.
- Billing automático (gateway), convite de 2º usuário, override de `IcmsInternalRate` por org via UI e subdomínio por tenant (`cliente.app.com`): fora de escopo por enquanto — nenhum é bloqueador técnico, são decisões de produto adiadas. Gatilhos concretos de quando reconsiderar: [saas-scale-triggers.md](saas-scale-triggers.md).
