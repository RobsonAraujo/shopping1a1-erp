# Marca Maipo

Identidade do ERP (antes "ERP 1a1"). A marca foi desenhada pelo SENAI em 2023/24,
num projeto de branding para a Maipo Engenharia. Adotamos o nome e o logo para o
produto em 2026-11.

Esta pasta guarda só os arquivos finais em vetor e PNG. Os originais (.ai, .psd),
os mockups e o **Brandbook (PDF)** ficaram fora do git, na pasta
"Maipo Rebranding SENAI" do Google Drive.

## Nome

- Escreve-se **Maipo**, com inicial maiúscula no texto. O logo usa "maipo" minúsculo.
- Concordância no **feminino**: "a Maipo", "da Maipo", "à Maipo".
  Exemplos: "A Maipo apura o Lucro Real", "Sobre a Maipo".

## Cores

| Uso                      | Hex       | Onde aparece                         |
| ------------------------ | --------- | ------------------------------------ |
| Azul-marinho (principal) | `#1B2D6F` | símbolo, palavra, `--brand`/`--primary` |
| Cinza-azulado (apoio)    | `#BECBD3` | pingo do "i" e semicírculo do "p"    |

Os SVGs originais trazem `#263369`/`#bccad3`, uma pequena diferença de exportação.
O app usa os códigos oficiais da tabela.

## Tipografia

- Marca: **Montserrat**. A palavra "maipo" do logo já vem convertida em curvas.
- App: **Geist** (decisão de 2026-11). É mais compacta para tabelas e números.

## Arquivos desta pasta

| Arquivo                        | Conteúdo                                      |
| ------------------------------ | --------------------------------------------- |
| `maipo-horizontal.svg`         | símbolo + palavra lado a lado (cor)           |
| `maipo-horizontal-pb.svg`      | horizontal em preto e cinza                   |
| `maipo-vertical.svg`           | símbolo sobre a palavra (cor)                 |
| `maipo-vertical-pb.svg`        | vertical em preto e cinza                     |
| `maipo-vertical-negativo.svg`  | vertical branco, para fundo escuro            |
| `maipo-*@4x.png`               | PNGs grandes, com fundo branco                |
| `maipo-simbolo.png`            | só o símbolo "MP" (cor)                        |

## No código

- `src/lib/brand/maipo-mark.ts` é a **fonte única** dos paths e cores do logo,
  com o recorte justo do símbolo e do logo horizontal.
- `src/components/shared/BrandLogo.tsx` é o logo em SVG inline:
  `variant="full" | "symbol"`, `tone="color" | "negative"`.
  O tamanho vem da altura (`className="h-8"`).
- `src/lib/marketing/og.tsx` é o cartão Open Graph, com o logo negativo.
- `public/brand/` traz o logo e o símbolo com recorte justo, para uso externo
  (portal do Mercado Livre, e-mail etc.).
- `public/icons/` e `src/app/favicon.ico` são os ícones: símbolo branco sobre o
  azul-marinho.

Para regenerar `public/brand/`, `public/icons/` e o favicon depois de mudar
cores ou tamanhos:

```sh
npm run brand:assets
```
