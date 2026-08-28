"use client";

import { Card } from "@/components/ui/card";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/financial-margin";
import { calcularComposicaoDas } from "@/lib/simples-nacional/das-calculator";
import type { AnexoFaixa } from "@/lib/simples-nacional/types";
import { TAX_REPORT_MONTH_NAMES } from "@/lib/tax-report/routes";

/**
 * Ordem e cor fixas por tributo — nunca reordenar/ciclar (identidade =
 * mesma cor sempre). PIS e COFINS aparecem como um único segmento (mesmo
 * tratamento de todo o resto do app, que já fala "PIS/COFINS" como uma coisa
 * só). Cores validadas com o script de paleta do skill de dataviz: mesmos
 * tons de `CATEGORY_TEXT_CLASS` (rose/amber/violet/emerald-600) do sistema
 * de tom do DRE (`src/lib/ui/tone.ts`) — o `CATEGORY_BORDER_COLOR` pastel de
 * lá é bom pra borda sutil, mas falha lightness/chroma como cor de gráfico;
 * o "primary" usa um índigo-600 (mesma família do `--primary` da marca) em
 * vez do azul-marinho sólido, que também falha a faixa de luminosidade.
 */
const DAS_SEGMENTS: Array<{
  key: "icms" | "cpp" | "pisCofins" | "irpj" | "csll";
  label: string;
  color: string;
}> = [
  { key: "icms", label: "ICMS", color: "#4f46e5" },
  { key: "cpp", label: "CPP (INSS patronal)", color: "#e11d48" },
  { key: "pisCofins", label: "PIS/COFINS", color: "#d97706" },
  { key: "irpj", label: "IRPJ", color: "#7c3aed" },
  { key: "csll", label: "CSLL", color: "#059669" },
];

type DasSegment = (typeof DAS_SEGMENTS)[number] & { percent: number; value: number };

function buildSegments(faixa: AnexoFaixa, valorDasMes: number): DasSegment[] {
  const valores = calcularComposicaoDas(valorDasMes, faixa);
  const percentuais = faixa.composicaoPercentual;
  const byKey: Record<DasSegment["key"], { percent: number; value: number }> = {
    icms: { percent: percentuais.icms, value: valores.icms },
    cpp: { percent: percentuais.cpp, value: valores.cpp },
    pisCofins: {
      percent: percentuais.pis + percentuais.cofins,
      value: valores.pis + valores.cofins,
    },
    irpj: { percent: percentuais.irpj, value: valores.irpj },
    csll: { percent: percentuais.csll, value: valores.csll },
  };
  return DAS_SEGMENTS.map((s) => ({ ...s, ...byKey[s.key] }));
}

const RADIUS = 82;
const STROKE_WIDTH = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP_DEGREES = 2.5;

type DonutArc = DasSegment & { segLength: number; offset: number };

/** Pura, fora do componente: acumula o offset de cada fatia sem mutar nada no render. */
function buildArcs(segments: DasSegment[]): DonutArc[] {
  const gapLength = (GAP_DEGREES / 360) * CIRCUMFERENCE;
  return segments.reduce<DonutArc[]>((acc, seg) => {
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.segLength + gapLength : 0;
    const rawLength = (seg.percent / 100) * CIRCUMFERENCE;
    const segLength = Math.max(0, rawLength - gapLength);
    return [...acc, { ...seg, segLength, offset }];
  }, []);
}

function DasDonut({
  segments,
  total,
  monthLabel,
}: {
  segments: DasSegment[];
  total: number;
  monthLabel: string;
}) {
  const arcs = buildArcs(segments);

  return (
    <div className="relative mx-auto size-56 shrink-0">
      <svg viewBox="0 0 224 224" className="-rotate-90" aria-hidden="true">
        <circle
          cx="112"
          cy="112"
          r={RADIUS}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={STROKE_WIDTH}
        />
        {arcs.map((arc) =>
          arc.segLength <= 0 ? null : (
            <circle
              key={arc.key}
              cx="112"
              cy="112"
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${arc.segLength} ${CIRCUMFERENCE - arc.segLength}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
            />
          ),
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-base font-bold tabular-nums text-[var(--primary)] break-words">
          {formatFinancialMoney(total)}
        </p>
        <p className="mt-1 text-[11px] leading-tight text-[var(--muted-foreground)]">
          DAS de {monthLabel}
        </p>
      </div>
    </div>
  );
}

export function SimplesDasComposicaoPanel({
  faixa,
  valorDasMes,
  year,
  month,
}: {
  faixa: AnexoFaixa;
  valorDasMes: number;
  /** Mês/ano cujo faturamento gerou `valorDasMes` — só para exibição, não entra no cálculo. */
  year: number;
  month: number;
}) {
  const segments = buildSegments(faixa, valorDasMes);
  const monthLabel = `${TAX_REPORT_MONTH_NAMES[month - 1]}/${year}`;

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Composição do DAS — Faixa {faixa.faixa}</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Repartição oficial do Anexo I (LC 123/2006) sobre o faturamento de{" "}
        {monthLabel} — informativo, não é um boleto separado por tributo.
      </p>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <DasDonut segments={segments} total={valorDasMes} monthLabel={monthLabel} />

        <ul className="w-full flex-1 space-y-2">
          {segments.map((seg) => (
            <li key={seg.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-[var(--foreground)]">{seg.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                  {formatFinancialPercent(seg.percent)}
                </span>
                <span className="font-medium tabular-nums">
                  {formatFinancialMoney(seg.value)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
