import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { useEffect, useState } from "react";
import { act, renderIntoDocument } from "@/test-setup/render";
import { HomeWidgetSlot } from "@/components/home/dashboard/HomeWidgetSlot";
import { HomeWidgetCard } from "@/components/home/dashboard/HomeWidgetCard";
import { HomeDashboardProvider } from "@/components/home/dashboard/HomeDashboardProvider";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import { coreSnapshot, flush } from "./home-dashboard-fixtures";

const DEFINITION = getHomeWidgetDefinition("pendencias")!;

/** Imita um widget carregado por `next/dynamic`: o card só aparece depois. */
function LateCard() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, []);
  if (!ready) return <div data-testid="skeleton" />;
  return (
    <HomeWidgetCard definitionId="pendencias">
      <p>corpo</p>
    </HomeWidgetCard>
  );
}

function renderSlot(
  children: React.ReactNode,
  props: { isDragging?: boolean; collapsed?: boolean } = {},
) {
  return renderIntoDocument(
    <HomeDashboardProvider
      core={coreSnapshot()}
      repository={createMemoryDashboardPreferences()}
    >
      <HomeWidgetSlot
        definition={DEFINITION}
        column={0}
        visible
        dragging={props.isDragging ?? false}
        isDragging={props.isDragging ?? false}
        collapsed={props.collapsed ?? false}
      >
        {children}
      </HomeWidgetSlot>
    </HomeDashboardProvider>,
  );
}

function slotOf(view: { container: HTMLElement }): HTMLElement {
  const slot = view.container.querySelector<HTMLElement>(
    `[data-widget-id="${DEFINITION.id}"]`,
  );
  assert.ok(slot, "o slot precisa estar no DOM");
  return slot;
}

describe("HomeWidgetSlot", () => {
  afterEach(() => mock.restoreAll());

  it("registra o arrasto num card presente desde o início", async () => {
    const view = renderSlot(
      <HomeWidgetCard definitionId="pendencias">
        <p>corpo</p>
      </HomeWidgetCard>,
    );
    await act(async () => {
      await flush();
    });

    // O pdnd marca `draggable="true"` no elemento que registra — é a prova
    // observável de que o registro aconteceu.
    const header = view.container.querySelector("[data-home-drag-element]");
    assert.ok(header, "o header precisa estar no DOM");
    assert.equal(header.getAttribute("draggable"), "true");
    view.unmount();
  });

  it("registra o arrasto num card que monta DEPOIS (next/dynamic)", async () => {
    // Regressão: quatro widgets da Home entram por `next/dynamic` e renderizam um
    // skeleton no primeiro paint. O slot procurava o header no mount, não achava,
    // e nunca registrava — o card mostrava mãozinha mas não arrastava, e tentar
    // arrastar selecionava o texto.
    const view = renderSlot(<LateCard />);

    assert.ok(
      view.container.querySelector('[data-testid="skeleton"]'),
      "começa como skeleton, igual ao dynamic",
    );

    await act(async () => {
      await flush();
    });

    const header = view.container.querySelector("[data-home-drag-element]");
    assert.ok(header, "o card montou");
    assert.equal(
      header.getAttribute("draggable"),
      "true",
      "o slot precisa registrar quando o elemento aparece",
    );
    view.unmount();
  });

  it("card escondido não registra arrasto nenhum", async () => {
    const view = renderIntoDocument(
      <HomeDashboardProvider
        core={coreSnapshot()}
        repository={createMemoryDashboardPreferences()}
      >
        <HomeWidgetSlot
          definition={DEFINITION}
          column={0}
          visible={false}
          dragging={false}
          isDragging={false}
          collapsed={false}
        >
          <HomeWidgetCard definitionId="pendencias">
            <p>corpo</p>
          </HomeWidgetCard>
        </HomeWidgetSlot>
      </HomeDashboardProvider>,
    );
    await act(async () => {
      await flush();
    });

    // Rect zero poderia ganhar uma colisão em 0,0 e dar preview em branco.
    const header = view.container.querySelector("[data-home-drag-element]");
    assert.equal(header, null, "sem alça: o contexto diz que não é arrastável");
    view.unmount();
  });

  // As duas asserções abaixo olham classe, não layout, porque é só o que o jsdom
  // dá (ele não calcula altura). O que elas guardam é a regra da sombra: quem
  // ocupa o espaço da origem em cada momento.
  it("origem sem sombra em outro card guarda o próprio espaço", async () => {
    const view = renderSlot(
      <HomeWidgetCard definitionId="pendencias">
        <p>corpo</p>
      </HomeWidgetCard>,
      { isDragging: true, collapsed: false },
    );
    await act(async () => {
      await flush();
    });

    const slot = slotOf(view);
    // Se colapsasse já ao pegar o card, tudo abaixo subiria de uma vez — era
    // exatamente o pulo que a sombra existe pra evitar.
    assert.ok(!slot.classList.contains("h-0"), "não cede o espaço ainda");
    assert.ok(
      slot.classList.contains("bg-[var(--muted)]/60"),
      "o próprio lugar vira a sombra",
    );
    view.unmount();
  });

  it("origem cede o espaço quando a sombra abre em outro card", async () => {
    const view = renderSlot(
      <HomeWidgetCard definitionId="pendencias">
        <p>corpo</p>
      </HomeWidgetCard>,
      { isDragging: true, collapsed: true },
    );
    await act(async () => {
      await flush();
    });

    const slot = slotOf(view);
    assert.ok(slot.classList.contains("h-0"), "colapsa");
    // Desmontar/`display:none` a origem no meio de um arrasto nativo pode
    // abortá-lo — o card continua no DOM, só sem altura.
    assert.ok(!slot.classList.contains("hidden"), "segue no fluxo, sem altura");
    assert.ok(
      view.container.querySelector("[data-home-drag-element]"),
      "a alça continua registrada durante o arrasto",
    );
    view.unmount();
  });
});
