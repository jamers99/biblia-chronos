import { test } from "node:test"
import assert from "node:assert/strict"
import { createRouter, linkLabel, type ConnectionsData, type Link } from "./connections.ts"

// Ruth's line to David, plus a group everyone is in, a shortcut that mustn't
// win, and an event that ties Moses to Elijah.
const links: Link[] = [
  ["ruth", "obed", "parent-of", "ruth.4.13"],
  ["obed", "jesse", "parent-of"],
  ["jesse", "david", "parent-of"],
  ["ruth", "genealogy", "member-of"],
  ["david", "genealogy", "member-of"],
  ["moses", "transfiguration", "participated-in"],
  ["elijah", "transfiguration", "participated-in"],
  ["moses", "sinai", "visited"],
  ["sinai", "elijah", "visited"], // stored the wrong way round, as data can be
  ["loner", "nowhere", "visited"],
  // Aaron and Moses are Amram's sons, and far apart the long way round.
  ["amram", "aaron", "parent-of"],
  ["amram", "moses", "parent-of"],
  ["aaron", "x1", "visited"],
  ["x1", "x2", "near"],
  ["x2", "x3", "near"],
  ["x3", "x4", "near"],
  ["x4", "moses", "visited"],
]
const data: ConnectionsData = { links, female: ["ruth"], closed: ["genealogy"], books: [] }
const router = createRouter(data)
const ids = (steps: { id: string }[]) => steps.map((s) => s.id)

test("a chain follows the family, not the group everyone is in", () => {
  const [best] = router.routes("ruth", "david")
  assert.deepEqual(ids(best), ["ruth", "obed", "jesse", "david"])
  assert.deepEqual(best[1], { id: "obed", type: "parent-of", forward: true, verse: "ruth.4.13" })
})

test("a chain can be read backwards", () => {
  const [best] = router.routes("david", "ruth")
  assert.deepEqual(ids(best), ["david", "jesse", "obed", "ruth"])
  assert.equal(best[1].forward, false)
})

test("a second chain goes another way", () => {
  const found = router.routes("moses", "elijah")
  assert.deepEqual(found.map(ids), [
    ["moses", "transfiguration", "elijah"],
    ["moses", "sinai", "elijah"],
  ])
})

test("a long detour isn't offered as another way", () => {
  assert.deepEqual(router.routes("aaron", "moses").map(ids), [["aaron", "amram", "moses"]])
})

test("family only keeps to the family", () => {
  assert.deepEqual(router.routes("moses", "elijah", true), [])
  assert.equal(router.routes("ruth", "david", true).length, 1)
})

test("a closed record can still be an end", () => {
  assert.deepEqual(ids(router.routes("ruth", "genealogy")[0]), ["ruth", "genealogy"])
})

test("no chain between unlinked records, or a record and itself", () => {
  assert.deepEqual(router.routes("ruth", "loner"), [])
  assert.deepEqual(router.routes("ruth", "ruth"), [])
  assert.deepEqual(router.routes("ruth", "unknown"), [])
  assert.equal(router.linked("unknown"), false)
})

test("links read down the chain, by gender where it matters", () => {
  assert.equal(linkLabel("parent-of", true, true), "mother of")
  assert.equal(linkLabel("parent-of", false, false), "son of")
  assert.equal(linkLabel("partner-of", false, true), "wife of")
  assert.equal(linkLabel("participated-in", true, false), "took part in")
  assert.equal(linkLabel("participated-in", false, false), "with")
})
