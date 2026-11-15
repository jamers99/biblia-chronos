import { test } from "node:test"
import assert from "node:assert/strict"
import { createRouter, linkLabel, type ConnectionsData, type Link } from "./connections.ts"

// Ruth's line to David, plus a group everyone is in, a shortcut that mustn't
// win, and an event that ties Moses to Elijah.
const links: Link[] = [
  ["ruth", "obed", "parent-of"],
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
const data: ConnectionsData = { links, dates: {}, female: ["ruth"], closed: ["genealogy"] }
const router = createRouter(data)
const ids = (steps: { id: string }[]) => steps.map((s) => s.id)

test("a chain follows the family, not the group everyone is in", () => {
  const [best] = router.routes("ruth", "david")
  assert.equal(best.kind, "closest")
  assert.deepEqual(ids(best.steps), ["ruth", "obed", "jesse", "david"])
  assert.deepEqual(best.steps[1], { id: "obed", type: "parent-of", forward: true })
})

test("a chain can be read backwards", () => {
  const [best] = router.routes("david", "ruth")
  assert.deepEqual(ids(best.steps), ["david", "jesse", "obed", "ruth"])
  assert.equal(best.steps[1].forward, false)
})

test("a second chain goes another way", () => {
  const found = router.routes("moses", "elijah")
  assert.deepEqual(
    found.map((r) => [r.kind, ids(r.steps)]),
    [
      ["closest", ["moses", "transfiguration", "elijah"]],
      ["other", ["moses", "sinai", "elijah"]],
    ],
  )
})

test("a long detour isn't offered as another way", () => {
  assert.deepEqual(
    router.routes("aaron", "moses").map((r) => ids(r.steps)),
    [["aaron", "amram", "moses"]],
  )
})

test("the family line is offered when the closest chain isn't one", () => {
  const family = createRouter({
    ...data,
    links: [["a", "b", "parent-of"], ["b", "c", "parent-of"], ["c", "d", "parent-of"], ["a", "e", "participated-in"], ["d", "e", "participated-in"]],
  })
  assert.deepEqual(
    family.routes("a", "d").map((r) => [r.kind, ids(r.steps)]),
    [
      ["closest", ["a", "e", "d"]],
      ["family", ["a", "b", "c", "d"]],
    ],
  )
})

test("a step through a place costs more the further apart in time its two sides are", () => {
  // Abraham at Hebron, David at Hebron nine centuries on, or the long way round
  // through people of their own day.
  const timed = createRouter({
    ...data,
    links: [
      ["abraham", "hebron", "visited"],
      ["david", "hebron", "visited"],
      ["abraham", "p1", "participated-in"],
      ["p1", "p2", "participated-in"],
      ["p2", "p3", "participated-in"],
      ["p3", "david", "participated-in"],
    ],
    dates: { abraham: -1900, p1: -1700, p2: -1400, p3: -1100, david: -1000 },
  })
  assert.deepEqual(ids(timed.routes("abraham", "david")[0].steps), ["abraham", "p1", "p2", "p3", "david"])
  // Undated, the place is the short way.
  const untimed = createRouter({ ...data, links: [...links, ["abraham", "hebron", "visited"], ["david", "hebron", "visited"]] })
  assert.deepEqual(ids(untimed.routes("abraham", "david")[0].steps), ["abraham", "hebron", "david"])
})

test("a closed record can still be an end", () => {
  assert.deepEqual(ids(router.routes("ruth", "genealogy")[0].steps), ["ruth", "genealogy"])
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
