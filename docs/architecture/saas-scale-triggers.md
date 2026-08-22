# Gatilhos de escala (SaaS)

Lista do que **não** precisa mudar agora, e o que mudar quando o volume
ou o faturamento justificarem. Não é backlog de feature — é “quando X
acontecer, faça Y”.

Isolamento por `organizationId`, auth e cron atuais: [saas-migration.md](saas-migration.md).

---

## Como o cron de catálogo funciona hoje

Um único job externo (cron-job.org) chama `POST /api/cron/catalog-competition`
cerca de **1× por hora**, com `CRON_SECRET`. A rota pega até **10** sellers
(`CRON_BATCH_SIZE` em `src/app/api/cron/catalog-competition/route.ts`) de
organizações `trialing` ou `active`, os mais atrasados primeiro
(`organization_ml_sellers.last_catalog_cron_polled_at`).

O webhook `POST /api/ml/notifications/catalog-competition` já atualiza
item a item quando a Mercado Livre notifica. O cron é o pente-fino (anúncios
que o webhook perdeu ou nunca disparou).

Isso existe para **não** estourar a cota do app ML compartilhado
(`MERCADOLIBRE_CLIENT_ID`) enquanto a base é pequena. Com mais de 10 sellers
pagantes, **ninguém** é coberto de hora em hora pelo cron — cada um espera
`ceil(N / 10)` horas. Ex.: 50 sellers ≈ a cada 5 horas.

Não criar um job no cron-job.org **por cliente**. O fan-out tem que
continuar dentro do produto.

---

## Quando mudar o cron

| Sinal | O que fazer |
|-------|-------------|
| Mais de ~10 sellers pagantes e o relatório de catálogo atrasar de verdade (não só no papel) | Subir `CRON_BATCH_SIZE` e/ou a frequência do job (ex. a cada 15 min). Medir HTTP 429 da ML **antes**. |
| Clientes pagando e exigindo pente-fino **hora a hora em todos** os orgs | Parar de caber o lote inteiro num request só (timeout Vercel). Fan-out: fila / worker (QStash, Inngest, ou N POSTs internos autenticados). O job externo continua **um**; quem espalha é o worker. |
| 429 frequentes, ou headers de rate limit no teto | 1) logar os headers reais em `src/lib/mercadolibre/api.ts`; 2) pedir aumento de cota à ML (Developer Partner); 3) só então app ML por tenant (plano B). Detalhe na seção [Rate limit](saas-migration.md#rate-limit-do-app-ml-compartilhado) da migração. |
| O POST do cron estourar timeout da Vercel | Mesmo fan-out: cada seller numa invocation curta. |

O alvo “buscar hora a hora para **todos** os orgs” só é seguro depois de
medir a cota real do Client ID. Sem isso, aumentar lote + frequência só
antecipa o 429 e prejudica **todos** os tenants de uma vez.

---

## Quando o faturamento / operação crescer

| Sinal | O que fazer |
|-------|-------------|
| Cansou de mudar `organizations.status` no Prisma Studio / rota admin | Gateway (Stripe ou Mercado Pago) gravando `status` via webhook. A coluna já existe (`trialing` / `active` / `past_due` / `canceled`). |
| Precisa de contador ou 2º login na mesma empresa | Convite + `OrganizationMember`. Schema pronto; a sessão hoje é só OAuth ML (`mlUserId`). |
| Um cliente com **duas** contas Mercado Livre | Hoje `organization_ml_sellers.ml_user_id` é único no banco (1 seller = 1 org). Mudar isso é decisão de produto + schema, não um flag. |
| Compliance / auditoria de isolamento entre tenants | Postgres RLS por `organizationId`. Hoje o isolamento é na aplicação + `src/lib/db-tenant-guard.ts` (só operações em lote). |
| Relatório tributário / DRE de um cliente degradando os outros | Pooler, índices, timeout por request; no extremo, read replica. Não split de banco por tenant até doer de verdade. |

---

## O que **não** é gatilho

- Trocar o modelo “um banco, uma linha por tenant”.
- Subdomínio por cliente (`cliente.app.com`).
- Reescrever o login (sair do OAuth ML) só porque entrou o 20º usuário.
- App Mercado Livre por tenant **antes** de medir cota e pedir aumento à ML.
