import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import { coreSnapshot } from "./home-dashboard-fixtures";
import { useState } from "react";
import {
  HomeWidgetCard,
  HomeWidgetDragProvider,
  HomeWidgetMeter,
} from "@/components/home/dashboard/HomeWidgetCard";

describe("HomeWidgetCard", () => {
  afterEach(() => mock.restoreAll());

  it("mantém o corpo montado quando colapsado", () => {
    // Regressão: a primeira versão da casca unificada fazia `{open ? corpo : null}`.
    // O `CollapsibleHomeCard` antigo mantinha os filhos montados e animava a
    // altura — desmontar matava a animação e zerava o estado de dentro (o
    // cronômetro do Foco em contagem, o campo do checklist).
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="notas" collapsible open={false}>
        <textarea defaultValue="rascunho" />
      </HomeWidgetCard>,
    );

    const textarea = container.querySelector("textarea");
    assert.ok(textarea, "o corpo precisa continuar no DOM com o card fechado");
    assert.equal(textarea.value, "rascunho");
    unmount();
  });

  it("o valor digitado sobrevive a fechar e reabrir", async () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <HomeWidgetCard
          definitionId="notas"
          collapsible
          open={open}
          onToggle={() => setOpen((v: boolean) => !v)}
        >
          <textarea />
        </HomeWidgetCard>
      );
    }

    const { container, unmount } = renderIntoDocument(<Wrapper />);
    const textarea = container.querySelector("textarea");
    assert.ok(textarea);
    await act(async () => {
      textarea.value = "não pode sumir";
    });

    const toggle = container.querySelector('[aria-expanded]') as HTMLElement | null;
    assert.ok(toggle);
    await act(async () => toggle.click());
    await act(async () => toggle.click());

    assert.equal(
      container.querySelector("textarea")?.value,
      "não pode sumir",
      "fechar e reabrir não pode remontar o corpo",
    );
    unmount();
  });

  it("clicar na seta abre e fecha, igual ao título", async () => {
    // Regressão: a seta era um ícone decorativo do lado de FORA do botão. O
    // título abria e fechava, a seta não fazia nada — e ela é a affordance mais
    // óbvia de um card colapsável. Agora ela vive DENTRO do botão, que continua
    // sendo o único controle do painel (um só `aria-expanded`).
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <HomeWidgetCard
          definitionId="notas"
          collapsible
          open={open}
          onToggle={() => setOpen((v: boolean) => !v)}
        >
          <p>corpo</p>
        </HomeWidgetCard>
      );
    }

    const { container, unmount } = renderIntoDocument(<Wrapper />);
    const toggle = container.querySelector("[aria-expanded]");
    assert.ok(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");

    const chevron = toggle.querySelector("svg");
    assert.ok(chevron, "a seta precisa viver dentro do botão que abre e fecha");
    await act(async () => {
      chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    assert.equal(
      container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded"),
      "true",
      "clicar na seta precisa abrir",
    );
    assert.equal(
      container.querySelectorAll("[aria-expanded]").length,
      1,
      "um controle só para o painel",
    );
    unmount();
  });

  it("a mãozinha aparece também no botão do título", () => {
    // O UA stylesheet põe `cursor: default` em `<button>`, e isso ganha do
    // `cursor-grab` que a alça passa por herança. Como no card colapsável o
    // título inteiro É um botão, ele era o único card sem mãozinha — nada
    // indicava que dava pra arrastar.
    const { container, unmount } = renderIntoDocument(
      <HomeDashboardProvider
        core={coreSnapshot()}
        repository={createMemoryDashboardPreferences()}
      >
        <HomeWidgetDragProvider value={{ draggable: true, setDragHandleRef: () => {} }}>
          <HomeWidgetCard definitionId="notas" collapsible open>
            <p>corpo</p>
          </HomeWidgetCard>
        </HomeWidgetDragProvider>
      </HomeDashboardProvider>,
    );

    const toggle = container.querySelector("[aria-expanded]");
    assert.ok(toggle);
    assert.ok(
      toggle.classList.contains("cursor-grab"),
      "o botão precisa repetir a mãozinha: herdar não basta",
    );

    // Na seta, o cursor volta a ser de clique: ela é o gesto mais barato de abrir
    // e fechar, e a mãozinha de arrastar aqui diria a coisa errada.
    const chevron = toggle.querySelector("svg");
    assert.ok(chevron, "a seta vive dentro do botão");
    assert.ok(
      chevron.classList.contains("cursor-pointer"),
      "a seta indica clique, não arrasto",
    );
    unmount();
  });

  it("colapsável expõe heading de nível 2 E o botão de expandir", () => {
    // Conteúdo de `<button>` é apresentacional em ARIA: um `role="heading"` DENTRO
    // do botão é achatado e não existe pro leitor de tela. O padrão da ARIA APG é
    // o inverso — `<h2><button aria-expanded>`.
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="notas" collapsible open>
        <p>corpo</p>
      </HomeWidgetCard>,
    );

    const heading = container.querySelector("h2");
    assert.ok(heading, "o contorno de headings da página precisa incluir o card");

    const button = heading.querySelector("button[aria-expanded]");
    assert.ok(button, "o botão de expandir precisa estar DENTRO do heading");
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.ok(
      button.getAttribute("aria-controls"),
      "aria-controls aponta pro painel",
    );
    unmount();
  });

  it("card não-colapsável usa h2 direto", () => {
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="pendencias">
        <p>corpo</p>
      </HomeWidgetCard>,
    );
    assert.ok(container.querySelector("h2"));
    assert.equal(container.querySelector("[aria-expanded]"), null);
    unmount();
  });

  it("preserva a acessibilidade do medidor de progresso", () => {
    // O medidor saiu do antigo `DashboardKpiCard` ao unificar a casca; o
    // `role="progressbar"` com `aria-valuenow` não pode ter se perdido no caminho.
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="kpi-compras">
        <HomeWidgetMeter
          label="Já comprados neste ciclo"
          value="3 de 5"
          percent={60}
          fillClassName="bg-[var(--primary)]"
        />
      </HomeWidgetCard>,
    );

    const meter = container.querySelector('[role="progressbar"]');
    assert.ok(meter, "o medidor precisa continuar sendo um progressbar");
    assert.equal(meter.getAttribute("aria-valuenow"), "60");
    assert.equal(meter.getAttribute("aria-valuemin"), "0");
    assert.equal(meter.getAttribute("aria-valuemax"), "100");
    assert.equal(meter.getAttribute("aria-label"), "Já comprados neste ciclo");
    unmount();
  });

  it("link e menu de mover ficam FORA da alça de arrasto", () => {
    // Se caíssem dentro, clicar neles iniciaria um arrasto nativo em vez de
    // navegar/abrir o menu — o DnD nativo não dá pra cancelar de um filho.
    // Dentro do provider porque o menu de mover lê o layout ativo.
    const { container, unmount } = renderIntoDocument(
      <HomeDashboardProvider
        core={coreSnapshot()}
        repository={createMemoryDashboardPreferences()}
      >
        <HomeWidgetDragProvider value={{ draggable: true, setDragHandleRef: () => {} }}>
          <HomeWidgetCard definitionId="kpi-compras">
            <p>corpo</p>
          </HomeWidgetCard>
        </HomeWidgetDragProvider>
      </HomeDashboardProvider>,
    );

    const handle = container.querySelector("[data-home-drag-handle]");
    const link = container.querySelector('a[aria-label^="Abrir "]');
    assert.ok(handle, "a alça precisa existir quando o card é arrastável");
    assert.ok(link, "kpi-compras tem href no registry");
    assert.equal(handle.contains(link), false, "o link não pode estar na alça");
    assert.equal(link.getAttribute("draggable"), "false", "âncora não arrasta sozinha");

    // A alça É o elemento arrastável (o pdnd registra nela), então tudo que se
    // clica no header precisa estar fora dela.
    const move = container.querySelector('[aria-label^="Mover "]');
    assert.ok(move, "o menu de mover existe num card arrastável");
    assert.equal(handle.contains(move), false, "o menu não pode estar na alça");
    unmount();
  });

  it("card não arrastável não expõe alça nenhuma", () => {
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="kpi-compras">
        <p>corpo</p>
      </HomeWidgetCard>,
    );
    assert.equal(container.querySelector("[data-home-drag-handle]"), null);
    unmount();
  });

  it("pending mostra skeleton e marca aria-busy", () => {
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="pendencias" pending>
        <p>corpo</p>
      </HomeWidgetCard>,
    );
    assert.equal(container.querySelector("section")?.getAttribute("aria-busy"), "true");
    assert.equal(container.textContent?.includes("corpo"), false);
    unmount();
  });

  it("error mostra o aviso dentro do card, sem derrubá-lo", () => {
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="pendencias" error="deu errado">
        <p>corpo</p>
      </HomeWidgetCard>,
    );
    const text = container.textContent ?? "";
    assert.match(text, /Pendências do sistema/, "o card continua na tela");
    assert.match(text, /deu errado/);
    unmount();
  });
});
