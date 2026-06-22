# Documentação — shopping1a1-erp

Documentação de arquitetura e processos do projeto. O README na raiz cobre setup, deploy e operação; aqui ficam decisões de design e planos de evolução.

## Arquitetura

| Documento | Conteúdo |
|-----------|----------|
| [Migração SaaS multi-tenant](architecture/saas-migration.md) | Estado atual single-tenant, modelo alvo, fases, mapa de arquivos e **registro de features** |
| [Modelo de dados do tenant](architecture/tenant-data-model.md) | Proposta de `Organization`, `User`, vínculo com Mercado Livre |
| [Mapa de fontes de dados](architecture/erp-data-sources.md) | Onde cada dado vive, tipos canônicos, APIs existentes e como carregar dados nos insights |

## Templates

| Template | Uso |
|----------|-----|
| [Impacto SaaS em features](templates/feature-saas-impact.md) | Checklist ao implementar ou alterar funcionalidades |

## Documentação por módulo

Módulos com README co-localizado (padrão do projeto):

- [Relatório tributário](../src/lib/tax-report/README.md)

## Processo

Ao adicionar ou alterar features que tocam dados, APIs ou autenticação:

1. Ler [saas-migration.md](architecture/saas-migration.md)
2. Registrar impacto na seção **Registro de features** usando o [template](templates/feature-saas-impact.md)
3. Ver regras em [AGENTS.md](../AGENTS.md) (agentes e contribuidores)
