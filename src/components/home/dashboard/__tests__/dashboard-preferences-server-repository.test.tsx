import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServerDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-server-repository";
import {
  buildDefaultDashboardPreferences,
  setDefaultView,
  setWidgetVisible,
  createView,
  type DashboardPreferences,
} from "@/lib/home/dashboard/dashboard-preferences";

/**
 * Conjunto DOM (não o puro) porque o repositório escreve cookie e agenda timer.
 *
 * O que estes testes seguram é o contrato que a Home depende: leitura com
 * identidade estável, escrita otimista, e **nenhum PUT** quando só mudou o que é
 * deste navegador.
 */

const SEED = buildDefaultDashboardPreferences();

function seedViews() {
  return SEED.views.map((view) => ({ ...view }));
}

type Call = { body: { views: unknown[]; revision: number } };

function repoWith(
  respond: (call: Call, index: number) => Response | Promise<Response>,
  seedRevision = 1,
) {
  const calls: Call[] = [];
  const errors: string[] = [];
  const repo = createServerDashboardPreferences(
    { views: seedViews(), revision: seedRevision, viewId: null },
    {
      fetchImpl: async (_url, init) => {
        const call = { body: JSON.parse(String(init?.body)) } as Call;
        calls.push(call);
        return respond(call, calls.length - 1);
      },
      onError: (message) => errors.push(message),
    },
  );
  return { repo, calls, errors };
}

/** Uma mudança real de conteúdo: esconder um widget. */
function hide(prefs: DashboardPreferences, id: string): DashboardPreferences {
  return setWidgetVisible(prefs, prefs.views[0].id, id, false);
}

describe("createServerDashboardPreferences", () => {
  it("devolve o MESMO objeto enquanto nada muda", () => {
    // `read()` é o `getSnapshot` do `useSyncExternalStore`: objeto novo a cada
    // leitura vira "The result of getSnapshot should be cached" e depois laço.
    const { repo } = repoWith(() => Response.json({ revision: 2 }));
    assert.equal(repo.read(), repo.read());
  });

  it("aplica a mudança na hora, antes de o servidor responder", async () => {
    // Arrastar um card não pode esperar ida e volta de rede.
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { repo } = repoWith(async () => {
      await blocked;
      return Response.json({ revision: 2 });
    });

    repo.write(hide(repo.read(), "notas"));
    const widget = repo
      .read()
      .views[0].widgets.find((w) => w.id === "notas");
    assert.equal(widget?.visible, false, "a tela já mostra o novo estado");

    release();
    await repo.flush();
  });

  it("agrupa escritas seguidas num PUT só", async () => {
    const { repo, calls } = repoWith(() => Response.json({ revision: 2 }));

    repo.write(hide(repo.read(), "notas"));
    repo.write(hide(repo.read(), "foco"));
    repo.write(hide(repo.read(), "atalhos"));
    await repo.flush();

    assert.equal(calls.length, 1, "três arrastos, um PUT");
    const sent = calls[0].body.views as DashboardPreferences["views"];
    const hidden = sent[0].widgets
      .filter((w) => !w.visible)
      .map((w) => w.id);
    assert.ok(hidden.includes("notas") && hidden.includes("foco"));
  });

  it("trocar a versão principal NÃO vai pro servidor", async () => {
    // Qual versão abre é deste navegador (cookie). Mandar isso pro banco faria
    // Robson mudar a Home do Jhonattan só por abrir a dele.
    const { repo, calls } = repoWith(() => Response.json({ revision: 2 }));
    const withTwo = createView(repo.read(), { name: "Jhonattan" });
    repo.write(withTwo.preferences);
    await repo.flush();
    assert.equal(calls.length, 1, "criar versão é conteúdo: grava");

    repo.write(setDefaultView(repo.read(), withTwo.viewId!));
    await repo.flush();

    assert.equal(calls.length, 1, "trocar a principal não gera PUT");
    assert.equal(repo.read().defaultViewId, withTwo.viewId);
  });

  it("conflito (409) adota o que está no banco em vez de sobrescrever", async () => {
    // Duas pessoas arrastando ao mesmo tempo: a segunda escrita não pode apagar
    // o trabalho da primeira em silêncio.
    const fromServer = seedViews();
    fromServer[0].name = "Vencedora";
    const { repo, errors } = repoWith(() =>
      Response.json(
        { error: "stale_revision", views: fromServer, revision: 9 },
        { status: 409 },
      ),
    );

    repo.write(hide(repo.read(), "notas"));
    await repo.flush();

    assert.equal(repo.read().views[0].name, "Vencedora");
    assert.equal(
      repo.read().views[0].widgets.find((w) => w.id === "notas")?.visible,
      true,
      "a mudança local foi descartada, não mesclada às cegas",
    );
    assert.match(errors[0] ?? "", /alterado em outro lugar/);
  });

  it("falha de rede volta ao último estado confirmado e avisa", async () => {
    // Deixar a tela mostrando uma mudança que não foi salva é mentir pro usuário.
    const { repo, errors } = repoWith(() => {
      throw new Error("offline");
    });

    repo.write(hide(repo.read(), "notas"));
    await repo.flush();

    assert.equal(
      repo.read().views[0].widgets.find((w) => w.id === "notas")?.visible,
      true,
      "voltou ao confirmado",
    );
    assert.match(errors[0] ?? "", /Não foi possível salvar/);
  });

  it("cria a linha quando a organização ainda não tem layout", async () => {
    const { repo, calls } = repoWith(() => Response.json({ revision: 1 }), 0);
    repo.write(hide(repo.read(), "notas"));
    await repo.flush();
    assert.equal(calls[0].body.revision, 0, "revisão 0 = estou criando");
  });
});
