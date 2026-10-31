import { test } from "node:test"
import assert from "node:assert/strict"
import { packLanes, timelineItems } from "./timeline.ts"
import type { Event, Period, Person } from "./data/schema.ts"

type Box = { id: string; x0: number; x1: number; w: number }
const box = (id: string, x0: number, x1: number, w = 0): Box => ({ id, x0, x1, w })
const pack = (items: Box[], maxLanes: number) =>
  packLanes(items, (b) => b.w, (b) => [b.x0, b.x1], maxLanes, 0)

test("packLanes puts non-overlapping items in one lane", () => {
  const { placed, hidden } = pack([box("a", 0, 10), box("b", 10, 20), box("c", 30, 40)], 3)
  assert.deepEqual(placed.map((p) => p.lane), [0, 0, 0])
  assert.equal(hidden, 0)
})

test("packLanes stacks overlaps and gives the heaviest item the first lane", () => {
  const { placed } = pack([box("light", 0, 10, 1), box("heavy", 5, 15, 9)], 3)
  const lane = Object.fromEntries(placed.map((p) => [p.item.id, p.lane]))
  assert.deepEqual(lane, { heavy: 0, light: 1 })
})

test("packLanes drops the lightest items when lanes run out", () => {
  const { placed, hidden } = pack([box("a", 0, 10, 3), box("b", 0, 10, 2), box("c", 0, 10, 1)], 2)
  assert.deepEqual(placed.map((p) => p.item.id), ["a", "b"])
  assert.equal(hidden, 1)
})

const period: Period = { id: "p", name: "Era", kind: "period", status: "published", source: "t", date: { earliest: -100, latest: 0 } }
const event = (id: string, earliest: number, latest = earliest): Event => ({
  id, name: id, kind: "event", status: "published", source: "t", date: { earliest, latest },
})
const person: Person = { id: "ezra", name: "Ezra", kind: "person", status: "draft", source: "t" }

test("timelineItems keeps dated items in range and skips lifetime-of events", () => {
  const events = [event("in", -50), event("before", -500), event("lifetime-of-ezra", -60, -10)]
  const items = timelineItems([person], events, [period], () => [events[0], events[2]])
  assert.deepEqual(items.map((i) => [i.kind, i.id, i.start, i.end, i.eras]), [
    ["event", "in", -50, -50, "Era"],
    ["person", "ezra", -60, -10, "Era"],
  ])
  assert.equal(items[1].draft, true)
  assert.equal(items[1].lifetime, false)
})
