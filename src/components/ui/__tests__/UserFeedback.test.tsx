import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { UserFeedback } from "../user-feedback";

describe("UserFeedback", () => {
  it("uses role=alert and maps a technical error string for the user", () => {
    const { container, unmount } = renderIntoDocument(
      <UserFeedback tone="error">products_load_failed</UserFeedback>,
    );
    const alert = container.querySelector('[role="alert"]');
    assert.ok(alert);
    assert.match(alert?.textContent ?? "", /Algo deu errado/);
    assert.match(
      alert?.textContent ?? "",
      /Não foi possível carregar os produtos/,
    );
    unmount();
  });

  it("uses role=status and the default title for non-error tones", () => {
    const { container, unmount } = renderIntoDocument(
      <UserFeedback tone="success">Cadastro atualizado.</UserFeedback>,
    );
    const status = container.querySelector('[role="status"]');
    assert.ok(status);
    assert.match(status?.textContent ?? "", /Pronto/);
    assert.match(status?.textContent ?? "", /Cadastro atualizado/);
    unmount();
  });

  it("calls onDismiss from the close button", () => {
    let dismissed = false;
    const { container, unmount } = renderIntoDocument(
      <UserFeedback tone="info" onDismiss={() => { dismissed = true; }}>
        Dica
      </UserFeedback>,
    );
    const close = container.querySelector('button[aria-label="Fechar"]');
    assert.ok(close);
    act(() => {
      close!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(dismissed, true);
    unmount();
  });
});
