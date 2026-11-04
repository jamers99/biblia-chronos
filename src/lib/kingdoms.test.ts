import { test } from "node:test"
import assert from "node:assert/strict"
import { kingdomTrack, placeLabels, reignContext, LONE } from "./kingdoms.ts"
import type { Event, Kingdom } from "./data/schema.ts"

const event = (id: string, name: string, earliest: number, latest: number): Event => ({
  id, name, kind: "event", status: "published", source: "t", date: { earliest, latest },
})
const events = [
  event("united", "United Kingdom", -1094, -974),
  event("north", "Northern Kingdom", -974, -720),
  event("south", "Southern Kingdom", -974, -584),
  event("reign-of-saul", "Reign of Saul", -1094, -1054),
  event("reign-of-david", "Reign of David", -1054, -1014),
  event("reign-of-a", "Reign of A", -974, -950),
  event("reign-of-b", "Reign of B", -951, -930), // one-year hand-over from A
  event("reign-of-c", "Reign of C", -935, -932), // overlaps B: a rival
  event("reign-of-d", "Reign of D", -974, -940),
  event("reign-of-e", "Reign of E", -940, -900),
]
const k = (id: string, ev: string, reigns: [string, string][]): Kingdom => ({
  id, name: id, source: "t", event: ev, reigns: reigns.map(([event, house]) => ({ event, house })),
})
const track = kingdomTrack(
  [
    k("united", "united", [["reign-of-saul", "House of Saul"], ["reign-of-david", "House of David"]]),
    k("israel", "north", [["reign-of-a", "House of A"], ["reign-of-b", "House of A"], ["reign-of-c", "House of Saul"]]),
    k("judah", "south", [["reign-of-d", "House of David"], ["reign-of-e", "E"]]),
  ],
  events,
)

test("kingdomTrack gives overlapping kingdoms rows and runs the united one across them", () => {
  assert.equal(track.rows, 2)
  assert.deepEqual(track.kingdoms.map((k) => k.row), ["all", 0, 1])
})

test("kingdomTrack names kings, steps rivals onto a sub-line, and tolerates one-year hand-overs", () => {
  const israel = track.kingdoms[1]
  assert.deepEqual(israel.reigns.map((r) => [r.king, r.sub]), [["A", 0], ["B", 0], ["C", 1]])
})

test("kingdomTrack groups consecutive reigns into houses and keeps a house's colour across kingdoms", () => {
  const [united, israel, judah] = track.kingdoms
  assert.deepEqual(israel.houses.map((h) => [h.name, h.start, h.end]), [["House of A", -974, -930], ["House of Saul", -935, -932]])
  assert.equal(united.reigns[1].tone, 0) // David's house has its own colour
  assert.equal(judah.reigns[0].tone, 0)
  assert.equal(israel.reigns[2].tone, united.reigns[0].tone) // Saul's house, wherever it reigns
  assert.notEqual(israel.reigns[0].tone, united.reigns[0].tone)
})

test("placeLabels sticks labels to the edge, keeps them apart, and drops what doesn't fit", () => {
  const placed = placeLabels([
    { text: "Kingdom", start: -500, end: 900, width: 60 },
    { text: "House 1", start: -200, end: 200, width: 50 }, // pushed right of "Kingdom"
    { text: "House 2", start: 200, end: 230, width: 50 }, // too narrow
    { text: "House 3", start: 300, end: 900, width: 50 },
  ])
  assert.deepEqual(placed.map((l) => [l.text, l.x]), [["Kingdom", 6], ["House 1", 78], ["House 3", 304]])
})

test("kingdomTrack marks where houses change on the main line, and labels only real houses", () => {
  const israel = track.kingdoms[1]
  assert.deepEqual(israel.reigns.filter((r) => !r.sub).map((r) => [r.king, r.opens, r.closes]), [["A", true, false], ["B", false, true]])
  const judah = track.kingdoms[2]
  assert.deepEqual(judah.houses.map((h) => h.named), [true, false]) // E founded no dynasty
  assert.equal(judah.reigns[1].tone, LONE)
})

test("reignContext finds a reign's kingdom and the kings either side", () => {
  const at = reignContext(track, "reign-of-b")!
  assert.equal(at.kingdom.id, "israel")
  assert.deepEqual([at.before?.king, at.after?.king], ["A", "C"])
  assert.equal(reignContext(track, "nowhere"), undefined)
})
