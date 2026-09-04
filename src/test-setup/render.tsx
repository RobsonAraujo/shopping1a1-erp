import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

export { act };

export function renderIntoDocument(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    rerender: (next: ReactElement) => {
      act(() => {
        root.render(next);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export function renderHook<T>(useHook: () => T) {
  const resultRef: { current: T } = { current: undefined as T };

  function Probe() {
    resultRef.current = useHook();
    return null;
  }

  const view = renderIntoDocument(<Probe />);
  return {
    result: resultRef,
    rerender: () => view.rerender(<Probe />),
    unmount: view.unmount,
  };
}

export async function waitFor(
  assertFn: () => void,
  timeoutMs = 1000,
): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      assertFn();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  throw lastError;
}
