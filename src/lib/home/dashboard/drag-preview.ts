/**
 * O fantasma do arrasto da Home: o **card inteiro**, não uma etiqueta com o
 * título.
 *
 * É uma cópia **estática** do DOM do card, e isso é a decisão central do arquivo.
 * O caminho óbvio seria `createRoot(container).render(<Widget/>)`, como o exemplo
 * do Pragmatic faz — mas aqui isso montaria uma segunda árvore React do widget,
 * com os effects rodando de novo, e dois dos nossos widgets buscam no Mercado
 * Livre (PMA e promoções). Um clone de DOM não executa nada: nem effect, nem
 * request, nem timer.
 *
 * O container que o pdnd entrega é `position: fixed` e shrink-to-fit, e vive um
 * frame só — o tempo de o navegador tirar a foto que vira a imagem do arrasto.
 */

export function renderCardDragPreview({
  source,
  container,
  width,
}: {
  /** O wrapper do card no lugar dele. Fica intocado. */
  source: HTMLElement;
  /** O container do pdnd, já no documento. */
  container: HTMLElement;
  /** Largura medida do card, em px. */
  width: number;
}): void {
  // `cloneNode` já leva o estado vivo dos campos: o HTML manda propagar o raw
  // value da `textarea` e a checkedness do `input`, então a nota rápida aparece
  // escrita no fantasma sem cópia manual. Quem trocar isto por `innerHTML`
  // perde os dois — é o que o teste `leva o valor vivo dos campos` protege.
  const clone = source.cloneNode(true) as HTMLElement;
  // Dois `data-widget-id` iguais no documento, mesmo por um frame, confundiriam
  // qualquer coisa que procure o card por esse seletor.
  clone.removeAttribute("data-widget-id");
  // O card é `w-full`: sem largura explícita ele encolheria para o conteúdo,
  // porque o container do pdnd é shrink-to-fit.
  if (width > 0) container.style.width = `${width}px`;
  container.append(clone);
}
