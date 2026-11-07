import { test } from "node:test"
import assert from "node:assert/strict"
import { mergeEdges, mergeEntities, staleRemovals } from "./merge.ts"
import type { Edge } from "./schema.ts"

const edge = (from: string, to: string, source = "theographic"): Edge => ({ from, to, type: "parent-of", source })

test("mergeEntities overlays fields by id and adds new records", () => {
  const merged = mergeEntities([{ id: "a", name: "A", x: 1 }], [{ id: "a", x: 2 }, { id: "b", name: "B", x: 3 }])
  assert.deepEqual(merged, [{ id: "a", name: "A", x: 2 }, { id: "b", name: "B", x: 3 }])
})

test("mergeEdges adds and corrects edges, and a tombstone removes a seed edge", () => {
  const seed = [edge("a", "b"), edge("a", "c")]
  const merged = mergeEdges(seed, [
    { ...edge("a", "b"), source: "editorial" },
    { ...edge("a", "c"), remove: true },
    edge("d", "e", "editorial"),
  ])
  assert.deepEqual(merged, [edge("a", "b", "editorial"), edge("d", "e", "editorial")])
})

test("staleRemovals finds tombstones with nothing left to remove", () => {
  const seed = [edge("a", "b")]
  const stale = staleRemovals(seed, [{ ...edge("a", "b"), remove: true }, { ...edge("x", "y"), remove: true }])
  assert.deepEqual(stale.map((e) => e.from), ["x"])
})
