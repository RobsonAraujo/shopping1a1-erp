import {
  MAIPO_COLORS,
  maipoShapes,
  maipoViewBox,
  viewBoxAttr,
  type MaipoLogoVariant,
} from "@/lib/brand/maipo-mark";
import { cn } from "@/lib/utils";

/**
 * Logo Maipo em SVG inline: nítido em qualquer tamanho e sem request extra.
 * O tamanho vem da altura (`className="h-8"`); a largura segue a proporção.
 *
 * - `variant="full"`: símbolo + palavra "maipo" (padrão)
 * - `variant="symbol"`: só o monograma, para espaços apertados
 * - `tone="negative"`: versão para fundo escuro (azul vira branco)
 *
 * É decorativo (`aria-hidden`): o link/heading em volta carrega o nome.
 */
export function BrandLogo({
  variant = "full",
  tone = "color",
  className,
}: {
  variant?: MaipoLogoVariant;
  tone?: "color" | "negative";
  className?: string;
}) {
  const primary = tone === "negative" ? "#ffffff" : MAIPO_COLORS.navy;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBoxAttr(maipoViewBox(variant))}
      aria-hidden
      focusable="false"
      className={cn("block w-auto shrink-0", className)}
    >
      {maipoShapes(variant).map((shape, i) => (
        <path
          key={i}
          d={shape.d}
          fill={shape.tone === "primary" ? primary : MAIPO_COLORS.mist}
        />
      ))}
    </svg>
  );
}
