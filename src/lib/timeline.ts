// The timeline's data and layout, kept pure so it's testable and so the island
// only has to render. Items are built at build time and passed to the island as
// props; lanes are packed on every zoom, in pixels.

import type { Event, Period, Person } from "./data/schema.ts"
import { personSpan, spanOf, periodAt } from "./chronology.ts"
import { formatSpan, label, summarize } from "./format.ts"

export type TimelineItem = {
  id: string
  kind: "person" | "event"
  name: string
  start: number
  end: number
  // How much Scripture says about it (verse count). Busier items win lanes,
  // so zooming out keeps Abraham and the Exodus and drops minor figures.
  weight: number
  draft: boolean
  lifetime: boolean // people: true = birth–death known; false = attested years only
  when: string
  era?: string
  summary?: string
}

export type TimelinePeriod = { id: string; name: string; start: number; end: number; when: string; summary?: string }

export function timelinePeriods(periods: Period[]): TimelinePeriod[] {
  return periods.map((p) => ({
    id: p.id,
    name: p.name,
    start: p.date.earliest,
    end: p.date.latest,
    when: formatSpan(p.date.earliest, p.date.latest),
    summary: summarize(p.description),
  }))
}

// Everything dated within the periods' range. "Lifetime of X" events are left
// out: they'd duplicate X's own bar in the people lanes.
export function timelineItems(
  people: Person[],
  events: Event[],
  periods: Period[],
  eventsOf: (personId: string) => Event[],
): TimelineItem[] {
  const first = periods[0].date.earliest
  const last = periods[periods.length - 1].date.latest
  const inRange = (s: { start: number; end: number }) => s.end >= first && s.start <= last
  const era = (year: number) => periodAt(year, periods)?.name

  const eventItems = events.flatMap((e): TimelineItem[] => {
    const span = spanOf(e.date)
    if (!span || !inRange(span) || e.id.startsWith("lifetime-of-")) return []
    return [
      {
        id: e.id,
        kind: "event",
        name: e.name,
        ...span,
        weight: e.scriptureRefs?.length ?? 0,
        draft: e.status === "draft",
        lifetime: false,
        when: formatSpan(span.start, span.end),
        era: era(span.start),
      },
    ]
  })

  const personItems = people.flatMap((p): TimelineItem[] => {
    const span = personSpan(p, eventsOf(p.id))
    if (!span || !inRange(span)) return []
    return [
      {
        id: p.id,
        kind: "person",
        name: label(p),
        start: span.start,
        end: span.end,
        weight: p.scriptureRefs?.length ?? 0,
        draft: p.status === "draft",
        lifetime: span.lifetime,
        when: formatSpan(span.start, span.end),
        era: era(span.start),
        summary: summarize(p.description),
      },
    ]
  })

  return [...eventItems, ...personItems]
}

// --- Lane packing -----------------------------------------------------------

export type Placed<T> = { item: T; lane: number; x0: number; x1: number }

// Greedy packing in pixel space. Items are placed heaviest first, each into
// the first lane where its extent (mark plus label) doesn't collide; items
// that fit nowhere within `maxLanes` are dropped and counted, so zooming in
// reveals them. `extent` returns an item's [left, right] in pixels.
export function packLanes<T>(
  items: T[],
  weight: (item: T) => number,
  extent: (item: T) => [number, number],
  maxLanes: number,
  gap = 8,
): { placed: Placed<T>[]; hidden: number } {
  const lanes: [number, number][][] = []
  const placed: Placed<T>[] = []
  let hidden = 0

  for (const item of [...items].sort((a, b) => weight(b) - weight(a))) {
    const [x0, x1] = extent(item)
    const fits = (lane: [number, number][]) => lane.every(([a, b]) => x1 + gap <= a || x0 >= b + gap)
    let lane = lanes.findIndex(fits)
    if (lane === -1 && lanes.length < maxLanes) lane = lanes.push([]) - 1
    if (lane === -1) {
      hidden++
      continue
    }
    lanes[lane].push([x0, x1])
    placed.push({ item, lane, x0, x1 })
  }
  return { placed, hidden }
}
