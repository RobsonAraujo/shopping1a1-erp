"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, RotateCcw, ShoppingCart, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/ui/form-input";
import { UserFeedback } from "@/components/ui/user-feedback";
import { MetricWithHint } from "@/components/metric-with-hint";
import { readApiError } from "@/lib/api-client-error";
import { buildPurchaseCoverageBufferTooltip } from "@/lib/purchase-analysis";
import { cn } from "@/lib/utils";
import {
  OPERATIONAL_SETTINGS_DEFAULTS,
  type OperationalSettingsValues,
} from "@/lib/operational-settings-defaults";

type SectionTone = "sky" | "emerald" | "amber";

const SECTION_TONES: Record<
  SectionTone,
  { icon: string; border: string; chip: string; chipHover: string }
> = {
  sky: {
    icon: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
    border: "border-l-4 border-l-sky-400 dark:border-l-sky-600",
    chip: "border-sky-200/80 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100",
    chipHover: "hover:bg-sky-100 dark:hover:bg-sky-950/70",
  },
  emerald: {
    icon: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
    border: "border-l-4 border-l-emerald-400 dark:border-l-emerald-600",
    chip: "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100",
    chipHover: "hover:bg-emerald-100 dark:hover:bg-emerald-950/70",
  },
  amber: {
    icon: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    border: "border-l-4 border-l-amber-400 dark:border-l-amber-600",
    chip: "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
    chipHover: "hover:bg-amber-100 dark:hover:bg-amber-950/70",
  },
};

type SettingsResponse = { settings: OperationalSettingsValues };

type DraftValues = Record<keyof OperationalSettingsValues, string>;

function settingsToDraft(settings: OperationalSettingsValues): DraftValues {
  return {
    salesAverageWindowDays: String(settings.salesAverageWindowDays),
    leadTimeDays: String(settings.leadTimeDays),
    activeStockBufferDays: String(settings.activeStockBufferDays),
    targetCoverageBufferDays: String(settings.targetCoverageBufferDays),
    rotationHighDailyAvg: String(settings.rotationHighDailyAvg),
    rotationMediumDailyAvg: String(settings.rotationMediumDailyAvg),
    promotionExpiringSoonDays: String(settings.promotionExpiringSoonDays),
  };
}

function parseDraftInt(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

type FieldKey = keyof OperationalSettingsValues;

function SectionHeader({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: typeof Boxes;
  title: string;
  description: string;
  tone: SectionTone;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg shadow-sm",
          SECTION_TONES[tone].icon,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function SettingField({
  fieldKey,
  label,
  tooltip,
  helperText,
  draft,
  onChange,
  suffix = "dias",
  tone,
}: {
  fieldKey: FieldKey;
  label: string;
  tooltip: string;
  helperText: string;
  draft: DraftValues;
  onChange: (key: FieldKey, value: string) => void;
  suffix?: string;
  tone: SectionTone;
}) {
  const defaultValue = OPERATIONAL_SETTINGS_DEFAULTS[fieldKey];
  const currentValue = draft[fieldKey];
  const isCustomized =
    currentValue.trim() !== "" &&
    Number(currentValue.replace(",", ".")) !== defaultValue;
  const toneClasses = SECTION_TONES[tone];

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3.5 py-3">
      <MetricWithHint content={tooltip}>
        <span className="text-sm font-medium text-[var(--foreground)]">
          {label}
        </span>
      </MetricWithHint>
      <div className="mt-2 flex items-center gap-2">
        <FormInput
          id={`operational-settings-${fieldKey}`}
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={currentValue}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          inputClassName="tabular-nums max-w-[7rem]"
        />
        <span className="text-xs text-[var(--muted-foreground)]">
          {suffix}
        </span>
        {isCustomized ? (
          <button
            type="button"
            onClick={() => onChange(fieldKey, String(defaultValue))}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              toneClasses.chip,
              toneClasses.chipHover,
            )}
            title={`Restaurar padrão recomendado (${defaultValue})`}
          >
            <RotateCcw className="size-3" aria-hidden />
            padrão: {defaultValue}
          </button>
        ) : (
          <span
            className={cn(
              "ml-auto inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
              toneClasses.chip,
            )}
          >
            padrão: {defaultValue}
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        {helperText}
      </p>
    </div>
  );
}

export function OperationalSettingsClient() {
  const router = useRouter();
  const [settings, setSettings] = useState<OperationalSettingsValues | null>(
    null,
  );
  const [draft, setDraft] = useState<DraftValues>(
    settingsToDraft(OPERATIONAL_SETTINGS_DEFAULTS),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operational-settings");
      if (!res.ok)
        throw new Error(await readApiError(res, "operational_settings_load"));
      const json = (await res.json()) as SettingsResponse;
      setSettings(json.settings);
      setDraft(settingsToDraft(json.settings));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateField = (key: FieldKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const restoreAllDefaults = () => {
    setDraft(settingsToDraft(OPERATIONAL_SETTINGS_DEFAULTS));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    const parsed: Partial<Record<FieldKey, number>> = {};
    for (const key of Object.keys(draft) as FieldKey[]) {
      const value = parseDraftInt(draft[key]);
      if (value === null || value < 0) {
        setError(
          "Preencha todos os campos com um número válido (0 ou maior).",
        );
        setSaving(false);
        return;
      }
      parsed[key] = value;
    }

    if (
      parsed.rotationHighDailyAvg !== undefined &&
      parsed.rotationMediumDailyAvg !== undefined &&
      parsed.rotationHighDailyAvg <= parsed.rotationMediumDailyAvg
    ) {
      setError(
        "O limite de rotação Alta precisa ser maior que o limite de rotação Média.",
      );
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/operational-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok)
        throw new Error(await readApiError(res, "operational_settings_save"));
      const json = (await res.json()) as SettingsResponse;
      setSettings(json.settings);
      setDraft(settingsToDraft(json.settings));
      setMessage("Configurações salvas.");
      // Estoque, Compras, Operações Full e o painel Início usam esses
      // valores — sem isto, quem navegar pra lá em seguida pode ver dados
      // calculados com a config antiga por causa do cache de navegação.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Carregando…</p>
    );
  }

  const hasChanges =
    settings !== null &&
    JSON.stringify(draft) !== JSON.stringify(settingsToDraft(settings));

  return (
    <div className="space-y-6">
      <UserFeedback tone="info" title="Como funciona esta tela">
        Estes números controlam os cálculos de estoque, reposição e compra em
        todo o sistema (Estoque, Compras, Operações Full e o painel Início).
        Se você está começando agora, os valores em <strong>padrão</strong>{" "}
        já são um bom ponto de partida — ajuste só o que fizer sentido para a
        sua operação. Passe o mouse no ícone <strong>?</strong> ao lado de
        cada campo para entender exatamente o que ele muda.
      </UserFeedback>

      {error ? <UserFeedback>{error}</UserFeedback> : null}
      {message ? (
        <UserFeedback tone="success" title="Salvo">
          {message}
        </UserFeedback>
      ) : null}

      <Card className={cn("overflow-hidden p-0", SECTION_TONES.sky.border)}>
        <SectionHeader
          icon={Boxes}
          title="Reposição de estoque"
          description="Prazos usados para prever quando cada anúncio vai esgotar e quando agir. Aparece em Estoque, Compras e Operações Full."
          tone="sky"
        />
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
          <SettingField
            fieldKey="salesAverageWindowDays"
            label="Janela de vendas"
            tooltip="É a régua que o sistema usa pra medir se um anúncio está vendendo bem — é ela que dispara os alertas de reposição e compra. 'Janela' é de quantos dias pra trás tiramos essa amostra de vendas."
            helperText={`Ex.: com ${draft.salesAverageWindowDays || "…"} dias, um anúncio que vendeu 28 unidades nesse período tem média de ${
              Number(draft.salesAverageWindowDays) > 0
                ? (28 / Number(draft.salesAverageWindowDays)).toFixed(1)
                : "…"
            } un./dia. É essa média que o sistema compara pra decidir quando avisar que o estoque vai acabar.`}
            draft={draft}
            onChange={updateField}
            tone="sky"
          />
          <SettingField
            fieldKey="leadTimeDays"
            label="Prazo de reposição (Full)"
            tooltip="É o tempo entre o estoque sair do seu galpão e o anúncio voltar a vender no Full (envio + processamento do Mercado Livre). É quase igual pra qualquer produto, por isso é um número só aqui — diferente do prazo do fornecedor, que muda por produto e fica na tela Estoque, no botão Editar de cada anúncio."
            helperText="Ex.: se leva 14 dias entre enviar pro Full e o anúncio voltar a vender, deixe 14 aqui. Esse número soma com o prazo do fornecedor de cada produto pra avisar quando começar a reposição."
            draft={draft}
            onChange={updateField}
            tone="sky"
          />
          <SettingField
            fieldKey="activeStockBufferDays"
            label="Margem de segurança"
            tooltip="É uma folga extra de dias pra garantir que o novo estoque já esteja pronto pra vender — não só comprado — antes do atual acabar. Ajuda a evitar ficar com o anúncio sem estoque."
            helperText="Ex.: com 1 dia, o sistema avisa pra deixar o novo lote ativo pelo menos 1 dia antes do estoque atual zerar."
            draft={draft}
            onChange={updateField}
            tone="sky"
          />
        </div>
      </Card>

      <Card className={cn("overflow-hidden p-0", SECTION_TONES.emerald.border)}>
        <SectionHeader
          icon={ShoppingCart}
          title="Sugestão de compra"
          description="Como calculamos quanto comprar e quando um produto é considerado alta, média ou baixa rotação. Aparece na tela de Compras."
          tone="emerald"
        />
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
          <SettingField
            fieldKey="targetCoverageBufferDays"
            label="Buffer de cobertura padrão"
            tooltip={buildPurchaseCoverageBufferTooltip(
              Number(draft.salesAverageWindowDays) || undefined,
            )}
            helperText="Este é só o valor inicial: cada pessoa pode ajustar temporariamente na própria tela de Compras (fica salvo no navegador dela, sem afetar os outros)."
            draft={draft}
            onChange={updateField}
            tone="emerald"
          />
          <SettingField
            fieldKey="rotationHighDailyAvg"
            label="Rotação Alta a partir de"
            tooltip="A partir de quantas vendas por dia, em média, um produto é chamado de 'Alta rotação' (os que mais vendem). Precisa ser maior que o número da Rotação Média."
            helperText="Ex.: com 7, um produto vendendo 7 ou mais unidades por dia, em média, aparece como Alta rotação."
            draft={draft}
            onChange={updateField}
            suffix="vendas/dia"
            tone="emerald"
          />
          <SettingField
            fieldKey="rotationMediumDailyAvg"
            label="Rotação Média a partir de"
            tooltip="A partir de quantas vendas por dia, em média, um produto é chamado de 'Média rotação'. Abaixo disso — mas com alguma venda no período — o produto é classificado como 'Baixa rotação'."
            helperText="Ex.: com 3, um produto vendendo entre 3 e o limite de Alta rotação por dia aparece como Média rotação."
            draft={draft}
            onChange={updateField}
            suffix="vendas/dia"
            tone="emerald"
          />
        </div>
      </Card>

      <Card className={cn("overflow-hidden p-0", SECTION_TONES.amber.border)}>
        <SectionHeader
          icon={Tag}
          title="Promoções"
          description="Quando alertar, no painel Início, que uma promoção do Mercado Livre está perto de terminar."
          tone="amber"
        />
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
          <SettingField
            fieldKey="promotionExpiringSoonDays"
            label="Avisar com antecedência de"
            tooltip="Quantos dias antes de uma promoção do Mercado Livre terminar, o sistema já mostra ela como 'terminando em breve' no painel Início."
            helperText="Ex.: com 3 dias, promoções que faltam 3 dias ou menos para terminar ganham destaque no painel."
            draft={draft}
            onChange={updateField}
            tone="amber"
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={saving || !hasChanges} onClick={() => void save()}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={restoreAllDefaults}
        >
          Restaurar todos os padrões
        </Button>
      </div>
    </div>
  );
}
