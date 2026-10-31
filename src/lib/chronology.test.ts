import { test } from "node:test"
import assert from "node:assert/strict"
import { personSpan, periodAt, periodsOverlapping, spanOf } from "./chronology.ts"
import type { Event, Period, Person } from "./data/schema.ts"

const person = (extra: Partial<Person>): Person => ({
  id: "p", name: "P", kind: "person", status: "published", source: "t", ...extra,
})
const event = (earliest: number, latest = earliest): Event => ({
  id: `e${earliest}`, name: "E", kind: "event", status: "published", source: "t", date: { earliest, latest },
})
const period = (id: string, earliest: number, latest: number): Period => ({
  id, name: id, kind: "period", status: "published", source: "t", date: { earliest, latest },
})

test("spanOf tolerates one-sided estimates", () => {
  assert.deepEqual(spanOf({ earliest: -10 }), { start: -10, end: -10 })
  assert.equal(spanOf({ display: "?" }), undefined)
})

test("personSpan prefers a known lifetime", () => {
  const p = person({ birth: { earliest: -1571, latest: -1571 }, death: { earliest: -1452, latest: -1452 } })
  assert.deepEqual(personSpan(p, [event(-1000)]), { start: -1571, end: -1452, lifetime: true })
})

test("personSpan falls back to attested years from events and partial dates", () => {
  assert.deepEqual(personSpan(person({}), [event(45, 46), event(33), event(57, 60)]), { start: 33, end: 60, lifetime: false })
  assert.deepEqual(personSpan(person({ death: { earliest: 30 } }), [event(27)]), { start: 27, end: 30, lifetime: false })
  assert.equal(personSpan(person({}), []), undefined)
})

test("periodAt and periodsOverlapping use the period spans", () => {
  const periods = [period("a", -100, -50), period("b", -50, 10)]
  assert.equal(periodAt(-50, periods)?.id, "b")
  assert.equal(periodAt(10, periods)?.id, "b")
  assert.equal(periodAt(11, periods), undefined)
  assert.deepEqual(periodsOverlapping({ start: -60, end: -55 }, periods).map((p) => p.id), ["a"])
  assert.deepEqual(periodsOverlapping({ start: -60, end: 0 }, periods).map((p) => p.id), ["a", "b"])
  // touching a boundary isn't overlapping; a single year on it belongs to the later era
  assert.deepEqual(periodsOverlapping({ start: -60, end: -50 }, periods).map((p) => p.id), ["a"])
  assert.deepEqual(periodsOverlapping({ start: -50, end: -50 }, periods).map((p) => p.id), ["b"])
})
