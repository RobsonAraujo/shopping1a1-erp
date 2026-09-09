import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatFinancialMoney, formatFinancialPercent } from "@/lib/pricing/financial-margin";
import { ANEXO_I_FAIXAS } from "@/lib/simples-nacional/anexo-i-table";
import { SimplesDasComposicaoPanel } from "@/components/simples-nacional/SimplesDasComposicaoPanel";

/**
 * Faixa 3 é dado real da tabela oficial do Anexo I (LC 123/2006) — só o
 * faturamento (RBT12) e o DAS do mês são fictícios, pra ilustrar uma loja
 * de exemplo.
 */
const FAIXA = ANEXO_I_FAIXAS[2];
const RBT12 = 540_000;
const VALOR_DAS_MES = 3_120;
const ALIQUOTA_EFETIVA = ((RBT12 * FAIXA.aliquotaNominalPercent) / 100 - FAIXA.parcelaDeduzir) / RBT12 * 100;
const FALTAM_PARA_PROXIMA_FAIXA = FAIXA.rbt12Max - RBT12;
const PROGRESSO_FAIXA = ((RBT12 - FAIXA.rbt12Min) / (FAIXA.rbt12Max - FAIXA.rbt12Min)) * 100;

function Rbt12Card() {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">RBT12 (últimos 12 meses)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
            {formatFinancialMoney(RBT12)}
          </p>
        </div>
        <Badge variant="warning">Faixa {FAIXA.faixa}</Badge>
      </div>

      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden>
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: `${Math.min(100, Math.max(0, PROGRESSO_FAIXA))}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Faltam {formatFinancialMoney(FALTAM_PARA_PROXIMA_FAIXA)} para entrar na Faixa{" "}
          {FAIXA.faixa + 1} — o painel avisa antes de você cruzar a linha.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--border)] px-3 py-2">
          <p className="text-[11px] text-[var(--muted-foreground)]">Alíquota nominal da faixa</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {formatFinancialPercent(FAIXA.aliquotaNominalPercent)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] px-3 py-2">
          <p className="text-[11px] text-[var(--muted-foreground)]">Alíquota efetiva calculada</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {formatFinancialPercent(ALIQUOTA_EFETIVA)}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function DemoSimplesDas() {
  return (
    <div className="space-y-4">
      <Rbt12Card />
      <SimplesDasComposicaoPanel
        faixa={FAIXA}
        valorDasMes={VALOR_DAS_MES}
        year={2026}
        month={8}
      />
    </div>
  );
}
