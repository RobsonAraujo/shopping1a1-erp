import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bestItemImageUrl } from "../item-image";
import type { ItemBody } from "../types";

function item(overrides: Partial<ItemBody> = {}): ItemBody {
  return { id: "MLB1", title: "Item", status: "active", ...overrides } as ItemBody;
}

describe("bestItemImageUrl", () => {
  it("prefers pictures[0].secure_url", () => {
    const it1 = item({
      pictures: [{ secure_url: "https://secure/1.jpg", url: "http://plain/1.jpg" }],
      secure_thumbnail: "https://thumb/1.jpg",
      thumbnail: "http://thumb/1.jpg",
    } as Partial<ItemBody>);
    assert.equal(bestItemImageUrl(it1), "https://secure/1.jpg");
  });

  it("falls back to pictures[0].url when secure_url is missing", () => {
    const it1 = item({
      pictures: [{ url: "http://plain/1.jpg" }],
    } as Partial<ItemBody>);
    assert.equal(bestItemImageUrl(it1), "http://plain/1.jpg");
  });

  it("falls back to secure_thumbnail when there are no pictures", () => {
    const it1 = item({ secure_thumbnail: "https://thumb/1.jpg" } as Partial<ItemBody>);
    assert.equal(bestItemImageUrl(it1), "https://thumb/1.jpg");
  });

  it("falls back to thumbnail as last resort", () => {
    const it1 = item({ thumbnail: "http://thumb/1.jpg" } as Partial<ItemBody>);
    assert.equal(bestItemImageUrl(it1), "http://thumb/1.jpg");
  });

  it("returns undefined when nothing is available", () => {
    assert.equal(bestItemImageUrl(item()), undefined);
  });

  it("skips an empty pictures array", () => {
    const it1 = item({
      pictures: [],
      thumbnail: "http://thumb/1.jpg",
    } as Partial<ItemBody>);
    assert.equal(bestItemImageUrl(it1), "http://thumb/1.jpg");
  });
});
