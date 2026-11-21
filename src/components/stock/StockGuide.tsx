"use client";

import { useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Ban,
  Bot,
  CircleHelp,
  ClipboardList,
  Coins,
  Hand,
  Info,
  ShoppingCart,
  Truck,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * "Como funciona o estoque": ícone discreto no topo das telas do Estoque que
 * abre o guia com todas as regras. Para quem chega novo e para quem só quer
 * lembrar. Um pontinho marca o ícone até a primeira abertura (por navegador).
 */

const SEEN_KEY = "stock-guide-seen";
const SEEN_EVENT = "stock-guide-seen";

function subscribeSeen(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // sem storage: o pontinho só volta a aparecer, nada quebra.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function StockGuideButton() {
  const [open, setOpen] = useState(false);
  // No servidor conta como "visto": o pontinho só aparece no navegador, sem piscar.
  const seen = useSyncExternalStore(subscribeSeen, readSeen, () => true);

  function openGuide() {
    setOpen(true);
    if (!seen) markSeen();
  }

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Como funciona o estoque"
              onClick={openGuide}
              className="relative text-[var(--muted-foreground)] hover:text-[var(--foreground)] [&_svg]:size-[18px]"
            >
              <CircleHelp aria-hidden />
              {!seen ? (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-[var(--primary)]" aria-hidden />
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Como funciona o estoque</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader className="pr-12">
            <SheetTitle>Como funciona o estoque</SheetTitle>
            <SheetDescription>
              O que o ERP faz sozinho, o que fica com você e como o custo troca. Nada muda no Mercado Livre: o
              ERP só lê.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-7 pb-6">
            <StockGuideContent />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function Section({ icon: SectionIcon, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        <SectionIcon className="size-4 text-[var(--primary)]" aria-hidden />
        {title}
      </h3>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--muted-foreground)]">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-[var(--border)]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-[var(--foreground)]">{children}</span>;
}

function SummaryColumn({ icon: ColumnIcon, title, items }: { icon: Icon; title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-3.5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]">
        <ColumnIcon className="size-3.5 text-[var(--primary)]" aria-hidden />
        {title}
      </p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const NUMBERS = [
  { name: "Em casa", body: "Tudo que está com vocês: galpão + depósito. É o livro do ERP, que só muda com entradas, vendas, saídas e ajustes." },
  { name: "Depósito", body: "O \"estoque no depósito\" que o Mercado Livre mostra: o que está separado para vender fora do Full. Vem do ML." },
  { name: "Galpão", body: "O que ainda não foi separado: Em casa − Depósito. Ninguém digita, é conta." },
  { name: "Full", body: "Tudo que está com o Mercado Livre nos centros dele: o que está à venda e o que ainda não está (em transferência, retirada, sem cobertura fiscal…). Perdidas pelo ML ficam fora. Vem do ML." },
  { name: "Total", body: "Em casa + Full." },
] as const;

function StockGuideContent() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryColumn
          icon={Bot}
          title="O ERP faz sozinho"
          items={[
            "Baixa toda venda, de todos os canais.",
            "Devolve ao estoque a venda cancelada antes do envio.",
            "Lê o Depósito e o Full no Mercado Livre.",
            "Troca o custo quando o lote antigo acaba e registra o nivelamento no DRE.",
            "Traz os anúncios novos.",
          ]}
        />
        <SummaryColumn
          icon={Hand}
          title="Você faz"
          items={[
            "Registra a entrada quando a mercadoria chega.",
            "Registra a saída quando manda para o Full (ou perde, quebra, dá de brinde).",
            "Marca \"Voltou do Full\" quando uma retirada chega.",
            "Confere as devoluções.",
            "Faz o inventário uma vez por mês.",
          ]}
        />
        <SummaryColumn
          icon={Ban}
          title="Não precisa"
          items={[
            "Lançar venda ou cancelamento.",
            "Lançar o que chega no Full.",
            "Digitar o galpão.",
            "Calcular custo médio ou nivelamento.",
          ]}
        />
      </div>

      <Section icon={Warehouse} title="Os números de cada produto">
        <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {NUMBERS.map((n) => (
            <div key={n.name} className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-3">
              <dt className="font-medium text-[var(--foreground)]">{n.name}</dt>
              <dd>{n.body}</dd>
            </div>
          ))}
        </dl>
        <p>
          Separou mercadoria para vender? Atualize o depósito no Mercado Livre, como hoje: o Galpão se ajusta sozinho.
          Leitura do ML que falhou aparece como &quot;—&quot;, nunca como 0.
        </p>
      </Section>

      <Section icon={ShoppingCart} title="Vendas e devoluções">
        <Bullets
          items={[
            <>
              <Strong>Toda venda baixa sozinha:</Strong> Full, Flex, Coleta, Agência, Envios Agora e B2B. O pedido do ML
              diz de onde a unidade saiu. Venda que saiu de casa baixa o Em casa (o depósito cai junto, no ML, e o Galpão
              não muda). Venda que saiu do Full não mexe no Em casa: o Full cai no ML.
            </>,
            <>
              <Strong>Kits</Strong> baixam os produtos que os compõem. As <Strong>opções de venda</Strong> (Clássico,
              Premium…) do mesmo produto são uma linha só, com um estoque só.
            </>,
            <>
              <Strong>Cancelada antes do envio:</Strong> volta sozinha para o estoque.
            </>,
            <>
              <Strong>Cancelada depois do envio ou devolvida:</Strong> vira uma pendência &quot;Devolução a
              conferir&quot;. Você diz se voltou boa (volta para o estoque), avariada ou não voltou. Nada volta sozinho,
              porque alguém precisa ver o produto.
            </>,
            <>
              <Strong>Venda sem produto:</Strong> um anúncio que o ERP ainda não conhece. Você liga ao produto certo e
              a venda baixa.
            </>,
            <>
              <Strong>Quando atualiza:</Strong> enquanto alguém usa o ERP, no máximo a cada 10 minutos, ou na hora no
              &quot;Sincronizar agora&quot;. Se ninguém abrir o ERP, nada se perde: a próxima leitura pega tudo desde a
              última.
            </>,
          ]}
        />
      </Section>

      <Section icon={Truck} title="Envio ao Full">
        <Bullets
          items={[
            <>
              Mandou mercadoria para o Full? Use <Strong>Registrar saída</Strong> (o motivo já vem &quot;Envio ao
              Full&quot;): escolha os produtos e a quantidade. Sai do Em casa na hora.
            </>,
            <>
              No Full, a mercadoria aparece sozinha quando o Mercado Livre recebe, primeiro como &quot;em
              transferência&quot;. Durante a viagem, o Total fica temporariamente menor.
            </>,
            <>
              Retirada do Full chegou em casa? Abra o produto e use <Strong>Voltou do Full</Strong>.
            </>,
            <>Envio ao Full e volta do Full só mudam a mercadoria de lugar: não mexem no custo.</>,
          ]}
        />
      </Section>

      <Section icon={ArrowDownToLine} title="Entradas e outras saídas">
        <Bullets
          items={[
            <>
              <Strong>Registrar entrada</Strong> quando a mercadoria chega no galpão: produtos, quantidade e, se mudou,
              o custo da NF. O custo atual já vem preenchido.
            </>,
            <>
              <Strong>Registrar saída</Strong> também serve para perda, avaria, brinde, uso interno e devolução ao
              fornecedor. Essas saem do estoque de vez, com o custo do lote vigente.
            </>,
            <>
              Errou uma entrada? Estorne em Entradas, enquanto nada dela foi vendido. Depois disso, corrija com um
              ajuste no produto.
            </>,
          ]}
        />
      </Section>

      <Section icon={Coins} title="Custo e nivelamento">
        <Bullets
          items={[
            <>
              Cada entrada vira um <Strong>lote</Strong>, com o custo dela. As vendas consomem o lote mais antigo
              primeiro (PEPS: o primeiro que entra é o primeiro que sai).
            </>,
            <>
              <Strong>Custo novo só vale quando o estoque no custo atual acaba.</Strong> Na venda que zera o lote
              antigo, o ERP passa o custo novo para o cadastro do produto (Lucratividade, Central e Calculadora usam
              sozinhas) e registra no DRE um nivelamento com o custo antigo, para o período em que ele valeu.
            </>,
            <>
              <Strong>Mesmo custo:</Strong> não registra nivelamento nenhum.
            </>,
            <>
              Corrigiu o custo no cadastro do produto? Vale como correção do lote vigente, não como custo novo. Custo
              novo entra pela entrada de mercadoria.
            </>,
          ]}
        />
        <div className="flex gap-2.5 rounded-xl bg-[var(--muted)]/30 p-3 text-xs">
          <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
          <p>
            Exemplo: restam 20 un a R$ 39,44 e chega uma entrada de 50 un a R$ 39,46. As 20 primeiras vendas saem a R$
            39,44. Na 20ª, o custo do cadastro vira R$ 39,46 e o DRE ganha o nivelamento a R$ 39,44 até a véspera.
            Daí em diante, as vendas saem a R$ 39,46.
          </p>
        </div>
      </Section>

      <Section icon={ClipboardList} title="Inventário (uma vez por mês)">
        <Bullets
          items={[
            <>
              Crie o inventário e imprima a folha. Ela pode ser <Strong>cega</Strong>, sem a quantidade esperada, para
              a contagem não ser influenciada.
            </>,
            <>
              Digite o que foi contado e <Strong>aprove</Strong>: a diferença vira ajuste. O que já foi vendido e
              ainda está na prateleira esperando envio entra na conta. Linha em branco não ajusta.
            </>,
            <>
              O saldo inicial do estoque veio do galpão digitado no ERP ou, quando era maior, do depósito do Mercado
              Livre. O primeiro inventário confirma esses números.
            </>,
          ]}
        />
      </Section>

      <Section icon={Info} title="Avisos na Posição">
        <Bullets
          items={[
            <>
              <Strong>Depósito maior que o Em casa:</Strong> o ML está anunciando mais do que vocês têm. Em geral
              faltou registrar uma entrada.
            </>,
            <>
              <Strong>Saiu mais do que entrou:</Strong> o Em casa ficou negativo. Registre a entrada que faltou, ou
              ajuste. O inventário também corrige.
            </>,
          ]}
        />
      </Section>
    </>
  );
}
