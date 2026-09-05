<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## SaaS multi-tenant

O ERP é **multi-tenant** (migração concluída) — toda tabela de negócio tem `organizationId` obrigatório, com um guard-rail em runtime (`src/lib/db/db-tenant-guard.ts`) recusando queries em lote sem esse filtro. Modelo completo e convenções: [`docs/architecture/tenant-data-model.md`](docs/architecture/tenant-data-model.md).

Ao implementar **feature nova** ou alterar módulo que toca **dados, APIs ou autenticação**:

1. `organizationId` é o primeiro parâmetro obrigatório em toda função nova que toca modelo de negócio; **nunca** criar singletons (`id: "default"`)
2. Rota de API nova: usar `requireOrganization()` (não `requireAuth()` puro)
3. Query em lote nova sobre modelo de negócio: `organizationId` no `where` — se o modelo for tenant-scoped, adicioná-lo a `TENANT_SCOPED_MODELS`

Índice geral: [`docs/README.md`](docs/README.md).

## UI components

Preferir componentes de `src/components/ui/` (wrappers Radix): `Button`, `FormSelect`, `Switch`, `Card`, `Tooltip`, `Popover`, `Badge`, `FormInput`, `Calendar`, `DatePicker`, `DateRangePicker`. Evitar `<input>`/`<select>` HTML cru em telas novas.

## Checagem após mudanças

Depois de alterar código: `npm run lint` e `npx tsc --noEmit`. Corrigir erros antes de encerrar.
