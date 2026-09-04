import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, renderHook } from "@/test-setup/render";
import { useTableSort } from "../use-table-sort";

type Row = { name: string; qty: number };

const rows: Row[] = [
  { name: "Zebra", qty: 2 },
  { name: "Águia", qty: 10 },
  { name: "beta", qty: 5 },
];

function getValue(row: Row, key: "name" | "qty"): string | number {
  return row[key];
}

describe("useTableSort", () => {
  it("sorts strings with pt-BR locale (accent-aware)", () => {
    const { result, unmount } = renderHook(() =>
      useTableSort<Row, "name" | "qty">(rows, getValue, {
        key: "name",
        direction: "asc",
      }),
    );
    assert.deepEqual(
      result.current.sortedRows.map((row) => row.name),
      ["Águia", "beta", "Zebra"],
    );
    unmount();
  });

  it("sorts numbers descending by default when switching column", () => {
    const { result, unmount } = renderHook(() =>
      useTableSort<Row, "name" | "qty">(rows, getValue, {
        key: "name",
        direction: "asc",
      }),
    );
    act(() => {
      result.current.onSortChange("qty");
    });
    assert.equal(result.current.sort.key, "qty");
    assert.equal(result.current.sort.direction, "desc");
    assert.deepEqual(
      result.current.sortedRows.map((row) => row.qty),
      [10, 5, 2],
    );
    unmount();
  });

  it("toggles direction when the same column is clicked again", () => {
    const { result, unmount } = renderHook(() =>
      useTableSort<Row, "name" | "qty">(rows, getValue, {
        key: "qty",
        direction: "desc",
      }),
    );
    act(() => {
      result.current.onSortChange("qty");
    });
    assert.equal(result.current.sort.direction, "asc");
    assert.deepEqual(
      result.current.sortedRows.map((row) => row.qty),
      [2, 5, 10],
    );
    unmount();
  });
});
