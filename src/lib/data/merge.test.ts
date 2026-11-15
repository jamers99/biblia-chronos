import { test } from "node:test"
import assert from "node:assert/strict"
import { mergeEdges, mergeEntities, redundantEdges, redundantFields, staleRemovals } from "./merge.ts"
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

test("redundantFields finds override fields that match the seed", () => {
  const seed = [{ id: "a", name: "A", x: 1 }, { id: "b", name: "B", x: 1 }]
  const found = redundantFields(seed, [{ id: "a", name: "A", x: 2 }, { id: "b", name: "B" }, { id: "c", name: "C" }])
  assert.deepEqual(found, [
    { id: "a", fields: ["name"], all: false },
    { id: "b", fields: ["name"], all: true },
  ])
})

test("redundantEdges finds override edges the seed already has", () => {
  const seed = [edge("a", "b"), { ...edge("a", "c"), note: "x" }]
  const found = redundantEdges(seed, [edge("a", "b", "editorial"), edge("a", "c", "editorial"), edge("d", "e", "editorial")])
  assert.deepEqual(found.map((e) => e.to), ["b"])
})
