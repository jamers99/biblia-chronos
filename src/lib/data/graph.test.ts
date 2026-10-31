import { test } from "node:test"
import assert from "node:assert/strict"
import { createGraph } from "./graph.ts"

const g = createGraph([
  { from: "amram", to: "moses", type: "parent-of", source: "t" },
  { from: "amram", to: "aaron", type: "parent-of", source: "t" },
  { from: "aaron", to: "moses", type: "sibling-of", source: "t" },
])

test("outgoing and incoming walk an edge both ways", () => {
  assert.deepEqual(g.outgoing("amram", "parent-of"), ["moses", "aaron"])
  assert.deepEqual(g.incoming("moses", "parent-of"), ["amram"])
  assert.deepEqual(g.outgoing("moses", "parent-of"), [])
})

test("either finds symmetric edges from both ends", () => {
  assert.deepEqual(g.either("moses", "sibling-of"), ["aaron"])
  assert.deepEqual(g.either("aaron", "sibling-of"), ["moses"])
})
