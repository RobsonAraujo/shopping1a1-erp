/**
 * Migração SaaS multi-tenant — Fase 2.1 (ver docs/architecture/saas-migration.md):
 * cria a `Organization` do cliente atual + owner + vínculo com cada seller ML
 * já conectado (`OrganizationMlSeller`).
 *
 * O backfill de `organizationId` nas tabelas de negócio (Fase 7) não depende
 * mais deste script — cada migration que apertou a coluna para NOT NULL já
 * faz seu próprio backfill defensivo idempotente (ver
 * prisma/migrations/20260821213929_saas_tenant_hardening_not_null e as
 * migrations da Fase 2). Esta etapa aqui só cobre o que aquelas migrations
 * não sabem fazer: criar o `User` dono e ligar cada `mlUserId` existente à
 * organização via `OrganizationMlSeller`.
 *
 * Idempotente — pode rodar de novo sem duplicar nada (usa upsert).
 *
 * Usage:
 *   npm run backfill:default-organization
 *   npm run backfill:default-organization -- --dry-run   (só mostra o que faria, não escreve)
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";

const ORG_SLUG = "default";
const ORG_NAME = "Shopping 1a1";
const OWNER_EMAIL = "contato.shop1a1@gmail.com";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const sellers = await prisma.mlSellerCredentials.findMany({
    select: { mlUserId: true },
  });

  if (sellers.length === 0) {
    console.log("Nenhuma credencial ML encontrada (banco vazio/dev) — nada a fazer.");
    return;
  }

  console.log(
    `Encontrado(s) ${sellers.length} seller(s) ML: ${sellers.map((s) => s.mlUserId).join(", ")}`,
  );

  if (dryRun) {
    console.log("--dry-run: nenhuma escrita será feita. Só contando linhas sem organizationId abaixo.");
  }

  let organizationId: string;

  if (dryRun) {
    const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
    if (!existing) {
      console.log(`(dry-run) criaria Organization slug="${ORG_SLUG}"`);
      organizationId = "dry-run-placeholder";
    } else {
      organizationId = existing.id;
    }
  } else {
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.upsert({
        where: { slug: ORG_SLUG },
        create: { name: ORG_NAME, slug: ORG_SLUG, status: "active" },
        update: {},
      });

      const owner = await tx.user.upsert({
        where: { email: OWNER_EMAIL },
        create: { email: OWNER_EMAIL, name: ORG_NAME },
        update: {},
      });

      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
        create: { organizationId: org.id, userId: owner.id, role: "owner" },
        update: {},
      });

      for (const { mlUserId } of sellers) {
        await tx.organizationMlSeller.upsert({
          where: { mlUserId },
          create: { organizationId: org.id, mlUserId, isPrimary: true },
          update: {},
        });
      }

      return org;
    });
    organizationId = result.id;
    console.log(`Organization "${ORG_SLUG}" (id=${organizationId}) + owner + ${sellers.length} seller(s) vinculados.`);
  }

  // organization_id em toda tabela de negócio já é NOT NULL (Fase 7) — cada
  // migration que apertou essa constraint fez seu próprio backfill defensivo
  // idempotente, então não há mais nada pra este script fazer nessas tabelas.
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
