import { test } from "node:test"
import assert from "node:assert/strict"
import { createRouter, linkLabel, pack, type Connections } from "./connections.ts"

// Ruth's line to David, plus a group everyone is in, a shortcut that mustn't
// win, an event that ties Moses to Elijah, and a town known only by its region.
const links: Connections["links"] = [
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
  ["achshaph", "asher", "part-of"],
  ["acco", "asher", "part-of"],
]
const data: Connections = { links, dates: {}, places: ["hebron"], female: ["ruth"], closed: ["genealogy", "asher"] }
const router = createRouter(pack(data))
const ids = (steps: { id: string }[]) => steps.map((s) => s.id)

test("a chain follows the family, not the group everyone is in", () => {
  const [best] = router.routes("ruth", "david")
  assert.equal(best.kind, "closest")
  assert.deepEqual(ids(best.steps), ["ruth", "obed", "jesse", "david"])
  assert.deepEqual(best.steps[1], { id: "obed", type: "parent-of", forward: true })
  assert.equal(router.linkOf(best.steps, 1), "mother of")
  // and there's no other way that isn't through the group
  assert.equal(router.routes("ruth", "david").length, 1)
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
  const family = createRouter(pack({
    ...data,
    links: [["a", "b", "parent-of"], ["b", "c", "parent-of"], ["c", "d", "parent-of"], ["a", "e", "participated-in"], ["d", "e", "participated-in"]],
  }))
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
  // through the generations between them (undated, as many are).
  const timed = createRouter(pack({
    ...data,
    links: [
      ["abraham", "hebron", "visited"],
      ["david", "hebron", "visited"],
      ["abraham", "p1", "parent-of"],
      ["p1", "p2", "parent-of"],
      ["p2", "p3", "parent-of"],
      ["p3", "david", "parent-of"],
    ],
    dates: { abraham: -1900, david: -1000 },
  }))
  assert.deepEqual(ids(timed.routes("abraham", "david")[0].steps), ["abraham", "p1", "p2", "p3", "david"])
  // nor by way of someone undated just after the place
  const laundered = createRouter(pack({
    ...data,
    links: [
      ["abraham", "hebron", "visited"],
      ["hebron", "nobody", "visited"],
      ["nobody", "david", "sibling-of"],
      ["abraham", "p1", "parent-of"],
      ["p1", "p2", "parent-of"],
      ["p2", "p3", "parent-of"],
      ["p3", "david", "parent-of"],
    ],
    dates: { abraham: -1900, david: -1000 },
  }))
  assert.deepEqual(ids(laundered.routes("abraham", "david")[0].steps), ["abraham", "p1", "p2", "p3", "david"])
  // Undated, the place is the short way.
  const untimed = createRouter(pack({ ...data, links: [...links, ["abraham", "hebron", "visited"], ["david", "hebron", "visited"]] }))
  assert.deepEqual(ids(untimed.routes("abraham", "david")[0].steps), ["abraham", "hebron", "david"])
})

test("a closed record can still be an end, and is a way through when there's no other", () => {
  assert.deepEqual(ids(router.routes("ruth", "genealogy")[0].steps), ["ruth", "genealogy"])
  assert.deepEqual(ids(router.routes("achshaph", "acco")[0].steps), ["achshaph", "asher", "acco"])
})

test("packing keeps only what's linked, each id once", () => {
  const packed = pack({ links: [["a", "b", "visited"], ["b", "c", "near"]], dates: { a: -10, z: 5 }, places: ["b"], female: ["c", "z"], closed: ["z"] })
  const { links, ...rest } = packed
  assert.deepEqual(rest, { ids: ["a", "b", "c"], dates: [-10, null, null], places: [1], female: [2], closed: [] })
  assert.deepEqual(links.map(([from, to]) => [from, to]), [[0, 1], [1, 2]])
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
