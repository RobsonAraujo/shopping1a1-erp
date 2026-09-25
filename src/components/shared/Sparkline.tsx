"use client";

import { useId } from "react";

/**
 * Sparkline de área + linha, em SVG puro — o projeto não tem (nem quer)
 * biblioteca de gráfico. Nasceu dentro de `DreOverview` e foi extraído quando
 * a Home passou a precisar da mesma curva.
 *
 * Detalhes que parecem decoração mas não são:
 * - a série é quebrada em segmentos nos furos (`null`), pra um mês sem dado
 *   não virar uma reta inventada ligando os vizinhos;
 * - a área tem baseline em zero (não no mínimo da série), pra resultado
 *   negativo aparecer abaixo da linha em vez de encostar no chão do card;
 * - com menos de 2 pontos finitos devolve um bloco vazio do mesmo tamanho,
 *   pra não fazer o card "pular" quando o dado chega.
 */

export type SparklineTone = "primary" | "sky" | "emerald" | "rose" | "amber" | "violet";

const SPARK_COLORS: Record<SparklineTone, string> = {
  primary: "#1b2d6f",
  sky: "#0284c7",
  emerald: "#059669",
  rose: "#be123c",
  amber: "#d97706",
  violet: "#7c3aed",
};

export function Sparkline({
  values,
  highlightIndex = null,
  tone = "primary",
  width = 240,
  height = 56,
  className = "h-14 w-full",
  ariaLabel,
}: {
  values: (number | null)[];
  /** Índice (0-based) do ponto a destacar com um marcador. */
  highlightIndex?: number | null;
  tone?: SparklineTone;
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const pad = 4;
  // `useId` em vez de um id derivado do tom: id de SVG é global ao documento,
  // então dois sparklines do mesmo tom na mesma página faziam o segundo pegar
  // o gradiente do primeiro.
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );

  if (finite.length < 2) {
    return <div className={className} aria-hidden />;
  }

  const min = Math.min(0, ...finite);
  const max = Math.max(0.01, ...finite);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (values.length - 1);

  const points = values.map((value, index) => {
    if (value == null || !Number.isFinite(value)) return null;
    return {
      x: pad + index * stepX,
      y: pad + (1 - (value - min) / range) * (height - pad * 2),
      index,
    };
  });

  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const point of points) {
    if (point == null) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 1) segments.push(current);

  const linePath = segments
    .map(
      (seg) =>
        "M " + seg.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L "),
    )
    .join(" ");

  const zeroY = pad + (1 - (0 - min) / range) * (height - pad * 2);
  const areaPath = segments
    .map((seg) => {
      const start = seg[0];
      const end = seg[seg.length - 1];
      return `M ${start.x.toFixed(1)} ${zeroY.toFixed(1)} L ${seg
        .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" L ")} L ${end.x.toFixed(1)} ${zeroY.toFixed(1)} Z`;
    })
    .join(" ");

  const color = SPARK_COLORS[tone];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point) =>
        point && point.index === highlightIndex ? (
          <circle
            key={point.index}
            cx={point.x}
            cy={point.y}
            r={3.25}
            fill={color}
            stroke="white"
            strokeWidth={1.5}
          />
        ) : null,
      )}
    </svg>
  );
}
