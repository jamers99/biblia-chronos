import { test } from "node:test"
import assert from "node:assert/strict"
import { storyChapters } from "./story.ts"
import { timelineItems } from "./timeline.ts"
import type { Event, Period, Person } from "./data/schema.ts"

const era = (id: string, earliest: number, latest: number, extra: Partial<Period> = {}): Period => ({
  id, name: id, kind: "period", source: "t", status: "published", date: { earliest, latest }, ...extra,
})
const event = (id: string, earliest?: number, refs = 1): Event => ({
  id, name: id, kind: "event", status: "published", source: "t",
  ...(earliest === undefined ? {} : { date: { earliest, latest: earliest } }),
  scriptureRefs: Array(refs).fill({ book: "gen", chapter: 1, verse: 1 }),
})
const person = (id: string, birth: number, death: number): Person => ({
  id, name: id, kind: "person", status: "published", source: "t",
  birth: { earliest: birth, latest: birth }, death: { earliest: death, latest: death },
})

const periods = [era("a", -100, -50), era("b", -50, 0)]
const events = [event("early", -90), event("busy", -60, 9), event("boundary", -50, 5)]
const people = [person("spans-both", -70, -30)]
const items = timelineItems(people, events, periods, () => [])
const byId = new Map<string, Event | Person>([...events, ...people].map((r) => [r.id, r]))
const records = {
  events: (ids: string[]) => ids.map((id) => byId.get(id) as Event),
  people: (ids: string[]) => ids.map((id) => byId.get(id) as Person),
  dotOf: (id: string) => (id === "lost" ? undefined : id === "alias" ? "here" : id),
}

test("storyChapters falls back to an era's best-attested moments and people", () => {
  const [a, b] = storyChapters(periods, items, records)
  // a moment belongs to the era it starts in (boundary year → the later era), in date order
  assert.deepEqual(a.moments.map((m) => m.id), ["early", "busy"])
  assert.deepEqual(b.moments.map((m) => m.id), ["boundary"])
  // a person belongs to every era their life overlaps
  assert.deepEqual([a.people, b.people].map((p) => p.map((x) => x.id)), [["spans-both"], ["spans-both"]])
})

test("storyChapters prefers chosen moments and people, and shows places as their map dots", () => {
  const chosen = era("a", -100, -50, {
    moments: ["busy", "undated"],
    people: ["spans-both"],
    places: ["here", "lost", "alias"],
    journey: { name: "Trip", places: ["here", "lost", "alias"] },
  })
  byId.set("undated", event("undated"))
  const [a] = storyChapters([chosen], items, records)
  assert.deepEqual(a.moments, [
    { id: "busy", name: "busy", when: "61 BC" },
    { id: "undated", name: "undated", when: "" },
  ])
  // "lost" has no dot; "alias" is drawn as "here", so it's the same dot
  assert.deepEqual(a.places, ["here"])
  assert.equal(a.journey, undefined) // one stop left isn't a journey
})
