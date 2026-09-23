/**
 * Lista "termo → explicação" usada nas páginas de conteúdo (o que a apuração
 * cobre, o que alimenta o DRE, o que o kanban controla). Antes era um `<ul>`
 * com `<strong>` embutido, diferente em cada página.
 */
export type DefinitionItem = {
  term: string;
  body: React.ReactNode;
};

export function DefinitionList({ items }: { items: readonly DefinitionItem[] }) {
  return (
    <dl className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      {items.map((item) => (
        <div key={item.term} className="px-6 py-5">
          <dt className="font-semibold text-[var(--foreground)]">{item.term}</dt>
          <dd className="legal-prose mt-1.5">
            <p>{item.body}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}
