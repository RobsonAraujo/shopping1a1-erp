<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## SaaS multi-tenant (documentação viva)

O ERP hoje é **single-tenant** (uma empresa por deployment). A evolução para SaaS está documentada em [`docs/architecture/saas-migration.md`](docs/architecture/saas-migration.md).

Ao implementar **feature nova** ou alterar módulo que toca **dados, APIs ou autenticação**:

1. Ler [`docs/architecture/saas-migration.md`](docs/architecture/saas-migration.md)
2. Adicionar entrada na seção **Registro de features** usando o template em [`docs/templates/feature-saas-impact.md`](docs/templates/feature-saas-impact.md)
3. Quando o custo for baixo, escrever código **tenant-ready**: passar `organizationId` em funções novas; **não** criar novos singletons (`id: "default"`)
4. Módulos com README próprio (ex.: `src/lib/tax-report/README.md`) podem ganhar subseção **Multi-tenant (futuro)** se o impacto for específico do domínio

Índice geral: [`docs/README.md`](docs/README.md).

## UI components

Preferir componentes de `src/components/ui/` (wrappers Radix): `Button`, `FormSelect`, `Switch`, `Card`, `Tooltip`, `Popover`, `Badge`, `FormInput`, `Calendar`, `DatePicker`, `DateRangePicker`. Evitar `<input>`/`<select>` HTML cru em telas novas.

## Checagem após mudanças

Depois de alterar código: `npm run lint` e `npx tsc --noEmit`. Corrigir erros antes de encerrar.
