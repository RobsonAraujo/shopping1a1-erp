import { after, mock } from "node:test";
import { JSDOM } from "jsdom";

void mock.module("@sentry/nextjs", {
  namedExports: {
    init() {},
    captureException() {},
    captureRequestError() {},
  },
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const globals: Record<string, unknown> = {
  window,
  self: window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  customElements: window.customElements,
  getComputedStyle: window.getComputedStyle,
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  IntersectionObserver: StubObserver,
  ResizeObserver: StubObserver,
  matchMedia: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
};

for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
  });
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

after(() => {
  window.close();
});
