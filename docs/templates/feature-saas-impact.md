# Template — Impacto SaaS (multi-tenant)

Copie este bloco ao registrar uma feature nova ou alteração relevante na seção **Registro de features** de [saas-migration.md](../architecture/saas-migration.md).

---

## [Nome da feature] — YYYY-MM-DD

- **Tabelas novas/alteradas:**
- **Precisa `organizationId`?** sim / não / parcial — explicar
- **APIs afetadas:**
- **Assume singleton?** sim / não — qual (`company_tax_settings.id = "default"`, `dre_month_snapshots` por mês, etc.)
- **Cron/background:**
- **Dados globais vs por org:**
- **Código já tenant-ready?** sim / não — o que falta
- **Ação futura na migração:**

### Exemplo preenchido

## Export Excel vendas SKU — 2026-06-18

- **Tabelas novas/alteradas:** nenhuma (export client-side)
- **Precisa `organizationId`?** não diretamente; lê snapshot já keyed por `sellerId`
- **APIs afetadas:** nenhuma nova; usa `GET /api/reports/monthly-tax` existente
- **Assume singleton?** não; mas produtos/custos no snapshot vêm de `Product` global
- **Cron/background:** nenhum
- **Dados globais vs por org:** exporta dados do snapshot do seller logado; custos de SKU são globais hoje
- **Código já tenant-ready?** parcial — passar `organizationId` quando `loadTaxCompanyConfig` e `obterCustoPorSku` forem escopados
- **Ação futura na migração:** garantir que snapshot e produtos sejam da mesma org na geração do relatório
