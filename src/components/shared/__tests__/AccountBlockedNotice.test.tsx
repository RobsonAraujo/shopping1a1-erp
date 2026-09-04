import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Organization } from "@/generated/prisma";
import { renderIntoDocument } from "@/test-setup/render";
import { AccountBlockedNotice } from "../AccountBlockedNotice";

function org(status: Organization["status"]): Organization {
  return {
    id: "org_1",
    name: "Loja Teste",
    slug: "loja-teste",
    status,
    statusUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    statusNote: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("AccountBlockedNotice", () => {
  it("shows the organization name and a human status label", () => {
    const { container, unmount } = renderIntoDocument(
      <AccountBlockedNotice organization={org("past_due")} />,
    );
    assert.match(container.textContent ?? "", /Acesso suspenso/);
    assert.match(container.textContent ?? "", /Loja Teste/);
    assert.match(container.textContent ?? "", /Pagamento pendente/);
    unmount();
  });

  it("labels a canceled organization", () => {
    const { container, unmount } = renderIntoDocument(
      <AccountBlockedNotice organization={org("canceled")} />,
    );
    assert.match(container.textContent ?? "", /Cancelada/);
    unmount();
  });
});
