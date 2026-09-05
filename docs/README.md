# Documentação — shopping1a1-erp

Documentação de arquitetura e processos do projeto. O README na raiz cobre setup, deploy e operação; aqui ficam decisões de design e planos de evolução.

## Arquitetura

| Documento | Conteúdo |
|-----------|----------|
| [Modelo de dados do tenant](architecture/tenant-data-model.md) | Multi-tenancy (concluído): `Organization`, `User`, `OrganizationMlSeller`, classificação das tabelas, guard-rail de isolamento, convenções obrigatórias em código novo |
| [Gatilhos de escala](architecture/saas-scale-triggers.md) | O que mudar quando houver muitos tenants ou receita (cron, ML rate limit, billing, RLS) |
| [Mapa de fontes de dados](architecture/erp-data-sources.md) | Onde cada dado vive, tipos canônicos, APIs existentes e como carregar dados nos insights |

## Documentação por módulo

Módulos com README co-localizado (padrão do projeto):

- [Relatório tributário](../src/lib/tax-report/README.md)
- [Simples Nacional](../src/lib/simples-nacional/README.md)

## Processo

O ERP é multi-tenant (`organizationId` obrigatório em toda tabela de negócio). Ao implementar ou alterar código que toca dados, APIs ou autenticação, seguir as convenções em [tenant-data-model.md](architecture/tenant-data-model.md) — não criar singletons, `organizationId` como primeiro parâmetro em funções novas, `requireOrganization()` em rotas novas. Regras gerais de agentes e contribuidores: [AGENTS.md](../AGENTS.md).
