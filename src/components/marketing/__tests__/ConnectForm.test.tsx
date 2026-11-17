import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, renderIntoDocument } from "@/test-setup/render";
import { ConnectForm } from "@/components/marketing/ConnectForm";

type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] };
const w = window as DataLayerWindow;

let cleanup: (() => void) | null = null;

beforeEach(() => {
  w.dataLayer = [];
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function events() {
  return (w.dataLayer ?? []).map((e) => e.event);
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit(form: HTMLFormElement): Event {
  const ev = new Event("submit", { bubbles: true, cancelable: true });
  act(() => {
    form.dispatchEvent(ev);
  });
  return ev;
}

function renderForm(offer: string | null = "beta-30d-2026-11", errorCode: string | null = null) {
  const rendered = renderIntoDocument(
    <ConnectForm offer={offer} errorCode={errorCode} />,
  );
  cleanup = rendered.unmount;
  const form = rendered.container.querySelector("form")!;
  const phone = rendered.container.querySelector<HTMLInputElement>(
    'input[name="whatsapp"]',
  )!;
  return { form, phone, container: rendered.container };
}

describe("ConnectForm (/conectar)", () => {
  it("posts to the signin route carrying the offer, with a hidden bot trap", () => {
    const { form, container } = renderForm();
    assert.equal(form.getAttribute("method"), "post");
    assert.equal(form.getAttribute("action"), "/api/auth/mercadolibre/signin");
    assert.equal(
      container.querySelector<HTMLInputElement>('input[name="offer"]')?.value,
      "beta-30d-2026-11",
    );
    assert.ok(container.querySelector('input[name="website"]'));
    assert.deepEqual(events(), ["connect_view"]);
  });

  it("goes straight to Mercado Livre without a phone", () => {
    const { form } = renderForm(null);
    const ev = submit(form);
    assert.equal(ev.defaultPrevented, false);
    const start = w.dataLayer!.find((e) => e.event === "oauth_start");
    assert.equal(start?.has_lead, false);
    assert.ok(!events().includes("lead_submit"));
  });

  it("holds the submit on a mistyped phone instead of dropping it silently", () => {
    const { form, phone, container } = renderForm();
    typeInto(phone, "1234");
    const ev = submit(form);
    assert.equal(ev.defaultPrevented, true);
    assert.match(container.textContent ?? "", /Confira o número com DDD/);
    assert.ok(!events().includes("oauth_start"));
  });

  it("tracks the lead and the OAuth start for a valid phone", () => {
    const { form, phone, container } = renderForm();
    typeInto(phone, "(11) 98765-4321");
    const ev = submit(form);
    assert.equal(ev.defaultPrevented, false);
    assert.deepEqual(events(), ["connect_view", "lead_submit", "oauth_start"]);
    const start = w.dataLayer!.find((e) => e.event === "oauth_start");
    assert.equal(start?.has_lead, true);
    assert.equal(start?.offer, "beta-30d-2026-11");
    const button = container.querySelector("button")!;
    assert.equal(button.disabled, true);
    assert.match(button.textContent ?? "", /Abrindo o Mercado Livre/);
  });

  it("reports the OAuth error it was opened with", () => {
    renderForm(null, "access_denied");
    const error = w.dataLayer!.find((e) => e.event === "oauth_error");
    assert.equal(error?.reason, "access_denied");
  });
});
