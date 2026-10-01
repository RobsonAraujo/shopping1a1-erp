import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences-repository";
import { buildDefaultDashboardPreferences } from "@/lib/home/dashboard/dashboard-preferences";

/**
 * O repositório em memória é o que os testes injetam no provider. O de produção
 * (banco) tem suíte própria em
 * `dashboard-preferences-server-repository.test.tsx`.
 */
describe("createMemoryDashboardPreferences", () => {
  it("também é estável entre leituras", () => {
    const repo = createMemoryDashboardPreferences();
    assert.equal(repo.read(), repo.read());
  });

  it("normaliza a entrada inicial inválida", () => {
    const repo = createMemoryDashboardPreferences("{");
    assert.deepEqual(repo.read(), buildDefaultDashboardPreferences());
  });
});
