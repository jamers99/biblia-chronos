import { test } from "node:test"
import assert from "node:assert/strict"
import { mapPlaces, mapStandIn } from "./map.ts"
import type { EdgeType, Period, Place } from "./data/schema.ts"

const place = (id: string, lng: number, featureType?: string): Place => ({
  id, name: id, kind: "place", status: "published", source: "t", coordinates: { lat: 31, lng }, featureType,
})
const period = (id: string, earliest: number, latest: number): Period => ({
  id, name: id, kind: "period", status: "published", source: "t", date: { earliest, latest },
})

test("mapPlaces projects places, drops unlocatable ones, and dates them by era", () => {
  const periods = [period("a", -100, -50), period("b", -50, 0)]
  const project = (p: Place) => (p.coordinates!.lng > 100 ? undefined : ([p.coordinates!.lng, 0] as [number, number]))
  const spans: Record<string, { start: number; end: number }[]> = { here: [{ start: -10, end: -10 }, { start: -90, end: -80 }] }
  const out = mapPlaces([place("here", 35), place("far", 120)], periods, project, (id) => spans[id] ?? [])
  assert.deepEqual(out.map((p) => [p.id, p.x, p.eras]), [["here", 35, ["a", "b"]]])
})

test("mapStandIn draws aliases as their place and spots in a city as the city", () => {
  const places = [place("aphek", 35), place("antipatris", 35), place("jerusalem", 35, "City"),
    place("fish-gate", 35), place("judah", 35, "Region"), place("hebron", 35), place("loop-a", 35), place("loop-b", 35)]
  const links: [string, EdgeType, string][] = [
    ["antipatris", "alias-of", "aphek"],
    ["fish-gate", "part-of", "jerusalem"],
    ["hebron", "part-of", "judah"],
    ["loop-a", "alias-of", "loop-b"],
    ["loop-b", "alias-of", "loop-a"],
  ]
  const outgoing = (id: string, type: EdgeType) => links.filter(([f, t]) => f === id && t === type).map(([, , to]) => to)
  const byId = (id: string) => places.find((p) => p.id === id)
  const standIn = (id: string) => mapStandIn(byId(id)!, outgoing, byId)
  assert.equal(standIn("antipatris"), "aphek")
  assert.equal(standIn("fish-gate"), "jerusalem")
  assert.equal(standIn("hebron"), "hebron") // part of a region, not a city: its own dot
  assert.equal(standIn("aphek"), "aphek")
  assert.equal(standIn("loop-a"), "loop-b") // a cycle stops rather than recursing forever
})
