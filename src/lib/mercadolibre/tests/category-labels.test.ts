import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCategoryPath } from "../category-labels";
import type { CategoryBody } from "../types";

describe("formatCategoryPath", () => {
  it("joins path_from_root segments with the › separator", () => {
    const category = {
      id: "MLB1000",
      name: "Aquário",
      path_from_root: [
        { id: "MLB1", name: "Casa" },
        { id: "MLB2", name: "Pet Shop" },
        { id: "MLB1000", name: "Aquário" },
      ],
    } as CategoryBody;
    assert.equal(formatCategoryPath(category), "Casa › Pet Shop › Aquário");
  });

  it("falls back to name when path_from_root is empty", () => {
    const category = { id: "MLB1000", name: "Aquário", path_from_root: [] } as CategoryBody;
    assert.equal(formatCategoryPath(category), "Aquário");
  });

  it("falls back to name when path_from_root is absent", () => {
    const category = { id: "MLB1000", name: "Aquário" } as CategoryBody;
    assert.equal(formatCategoryPath(category), "Aquário");
  });
});
