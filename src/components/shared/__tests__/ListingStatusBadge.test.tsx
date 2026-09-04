import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderIntoDocument } from "@/test-setup/render";
import { ListingStatusBadge, listingRowMutedClass } from "../ListingStatusBadge";

describe("ListingStatusBadge", () => {
  it("renders nothing for an active listing", () => {
    const { container, unmount } = renderIntoDocument(
      <ListingStatusBadge status="active" mlStock={5} />,
    );
    assert.equal(container.textContent, "");
    unmount();
  });

  it("renders a badge for a paused listing with no ML stock", () => {
    const { container, unmount } = renderIntoDocument(
      <ListingStatusBadge status="paused" mlStock={0} warehouseStock={0} />,
    );
    assert.match(container.textContent ?? "", /Pausado/);
    unmount();
  });

  it("flags the warehouse-stock variant when ML stock is out but warehouse has units", () => {
    const { container, unmount } = renderIntoDocument(
      <ListingStatusBadge status="paused" mlStock={0} warehouseStock={3} />,
    );
    assert.match(container.textContent ?? "", /galpão/);
    unmount();
  });
});

describe("listingRowMutedClass", () => {
  it("returns undefined for an active listing", () => {
    assert.equal(listingRowMutedClass("active", 5), undefined);
  });

  it("returns a muted class for a paused listing", () => {
    assert.equal(listingRowMutedClass("paused", 0), "bg-[var(--muted)]/25");
  });
});
