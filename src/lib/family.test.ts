import { test } from "node:test"
import assert from "node:assert/strict"
import { lineage } from "./family.ts"
import type { Person } from "./data/schema.ts"

const person = (id: string, gender: Person["gender"]): Person => ({
  id, name: id, kind: "person", status: "published", source: "test", gender,
})
const people = Object.fromEntries(
  [person("terah", "male"), person("abraham", "male"), person("sarah", "female"), person("isaac", "male"), person("hagar", "female"), person("ishmael", "male")].map((p) => [p.id, p]),
)
const parents: Record<string, string[]> = {
  isaac: ["sarah", "abraham"],
  abraham: ["terah"],
  ishmael: ["hagar"],
}
const parentsOf = (id: string) => (parents[id] ?? []).map((p) => people[p])

test("lineage follows the father back, oldest first", () => {
  assert.deepEqual(lineage(people.isaac, parentsOf).map((p) => p.id), ["terah", "abraham", "isaac"])
})

test("lineage falls back to the mother when no father is recorded", () => {
  assert.deepEqual(lineage(people.ishmael, parentsOf).map((p) => p.id), ["hagar", "ishmael"])
})

test("lineage stops on a cycle", () => {
  const cyclic = (id: string) => [id === "abraham" ? people.isaac : people.abraham]
  assert.deepEqual(lineage(people.isaac, cyclic).map((p) => p.id), ["abraham", "isaac"])
})
