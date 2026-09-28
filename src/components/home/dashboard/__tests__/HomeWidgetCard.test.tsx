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
        <HomeWidgetDragProvider value={{ draggable: true, setDragElementRef: () => {}, setDragHandleRef: () => {} }}>
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

    const dragElement = container.querySelector("[data-home-drag-element]");
    assert.ok(dragElement);
    assert.ok(dragElement.contains(handle), "a alça vive dentro do elemento arrastável");
    unmount();
  });

  it("card não arrastável não expõe alça nenhuma", () => {
    const { container, unmount } = renderIntoDocument(
      <HomeWidgetCard definitionId="kpi-compras">
        <p>corpo</p>
      </HomeWidgetCard>,
    );
    assert.equal(container.querySelector("[data-home-drag-element]"), null);
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
