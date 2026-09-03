import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  ShowPausedListingsSwitch,
  isPausedListingStatus,
  filterListingsByPausedVisibility,
  countPausedListings,
} from "./ShowPausedListingsSwitch";

function renderIntoDocument(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    rerender: (next: React.ReactElement) => {
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

describe("ShowPausedListingsSwitch", () => {
  it("shows the paused count only when there are paused listings", () => {
    const { container, unmount } = renderIntoDocument(
      <ShowPausedListingsSwitch checked={false} onCheckedChange={() => {}} pausedCount={3} />,
    );
    assert.match(container.textContent ?? "", /Mostrar pausados \(3\)/);
    unmount();
  });

  it("omits the count badge when pausedCount is zero", () => {
    const { container, unmount } = renderIntoDocument(
      <ShowPausedListingsSwitch checked={false} onCheckedChange={() => {}} pausedCount={0} />,
    );
    assert.match(container.textContent ?? "", /^Mostrar pausados$/);
    unmount();
  });

  it("calls onCheckedChange with the toggled value when clicked", () => {
    let lastValue: boolean | undefined;
    const { container, unmount } = renderIntoDocument(
      <ShowPausedListingsSwitch
        checked={false}
        onCheckedChange={(value) => {
          lastValue = value;
        }}
      />,
    );
    const switchButton = container.querySelector('button[role="switch"]');
    assert.ok(switchButton, "expected a switch button to render");
    act(() => {
      switchButton!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(lastValue, true);
    unmount();
  });
});

describe("isPausedListingStatus", () => {
  it("treats only 'paused' as paused", () => {
    assert.equal(isPausedListingStatus("paused"), true);
    assert.equal(isPausedListingStatus("active"), false);
    assert.equal(isPausedListingStatus(null), false);
    assert.equal(isPausedListingStatus(undefined), false);
  });
});

describe("filterListingsByPausedVisibility", () => {
  const items = [{ status: "active" }, { status: "paused" }, { status: "active" }];

  it("returns everything when showPaused is true", () => {
    const result = filterListingsByPausedVisibility(items, true, (i) => i.status);
    assert.equal(result.length, 3);
  });

  it("filters out paused items when showPaused is false", () => {
    const result = filterListingsByPausedVisibility(items, false, (i) => i.status);
    assert.deepEqual(result, [{ status: "active" }, { status: "active" }]);
  });
});

describe("countPausedListings", () => {
  it("counts only paused items", () => {
    const items = [{ status: "active" }, { status: "paused" }, { status: "paused" }];
    assert.equal(
      countPausedListings(items, (i) => i.status),
      2,
    );
  });
});
